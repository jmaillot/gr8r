# Pitfalls Research

**Domain:** Adding v3.6 features to Projects Studio (zero-dep Node stack): Entra ID Mappings page, OIDC linking docs, restore-source selection
**Researched:** 2026-11-27
**Confidence:** HIGH (codebase-grounded: groups.js, server.js SSO callback, export/restore.js, DEPLOY.md read directly)

## Critical Pitfalls

### Pitfall 1: Raw GUID paste stored without the canonicalizeGuid funnel — duplicate/dead mappings resurrection

**What goes wrong:**
The new Mappings page UI validates a pasted GUID client-side and posts it verbatim. Entra admin portal copies come in `{braced}`, uppercase, or no-hyphen variants. `canonicalizeGuid` (groups.js:34) collapses all variants to the canonical lowercase hyphenated form precisely so `{A-…}` and `a-…` become the same key against the `UNIQUE(group_guid, workspace_id)` index (db-adapter.mjs:405). If any write path skips the funnel (a new route, an MCP mirror, a bulk import), you get either a 500 from the unique-index violation (unhandled constraint error) or a second row for the same real group that then reads as a *different* mapping — the dead-mappings orphan problem the milestone explicitly wants to avoid, created by the new UI.

**Why it happens:**
The canonicalization lives in `groups.js`, but "adding a page" tempts developers to write fresh validation in the route handler instead of routing every input through the one existing funnel (the domains.js/Phase-75 lesson: one door, one rule).

**How to avoid:**
Every write path — UI save API, future MCP mirror, migration script — calls `guidRefusal(raw)` before touching the table, and stores ONLY `canonicalizeGuid(raw)`. The client may pre-validate for UX, but the server is the sole authority. Add a regression test asserting `{X}`, uppercase, and no-hyphen pastes collapse to one row (second save → keyed refusal, not 500).

**Warning signs:**
A grep for `group_guid` showing any INSERT whose value isn't the return of `canonicalizeGuid`; a test fixture with a non-canonical GUID stored as-is; "why does this mapping show twice?" bug reports.

**Phase to address:**
Mappings-page backend phase (server routes + save funnel) — before any UI exists to bypass it.

---

### Pitfall 2: Label rendered unescaped on a re-render path (the esc()-at-first-render-only trap)

**What goes wrong:**
The manual group label is opaque operator-entered text — the milestone's named XSS watch-item. Hand-rolled ES-module UI typically escapes correctly at first render (`esc()` in the list template), but this table will re-render through the app's existing mechanisms: 30s polling refresh, revision-merge hydration, i18n locale switch re-render, and the delete-then-repaint flow. If any of those re-render paths interpolates `row.label` raw (e.g., a helper that rebuilds one row instead of reusing the escaping template), a label like `<img src=x onerror=…>` fires — injected by an *operator*, but the surface is also fed by whoever typed the label originally, and stored XSS persists across sessions and users.

**Why it happens:**
Zero-dep hand-rolled rendering means escaping is a convention, not a framework guarantee. New string sinks (an inline `title="…"` attribute, a `data-label` attribute, a confirm-dialog message) are each a fresh injection point; the "it's display-only, never edited" mental model hides that display IS the sink.

**How to avoid:**
One escaping helper applied in ONE place — the row-render template — and every state change (create, delete, i18n switch, poll) routes through a full-table repaint using that template, never a bespoke partial-DOM patch that re-types the label. Audit every attribute context: `esc()` for text nodes is not sufficient for attribute interpolation (quotes) — use the existing house `esc()` everywhere it's already used for names, and add an e2e/unit test rendering a hostile label and asserting zero script/img sink.

**Warning signs:**
A re-render code path that string-concatenates `label` directly; a confirm dialog built with template literals around the label; any new `.innerHTML` assignment in the mappings view not going through the shared template.

**Phase to address:**
Mappings-page UI phase — pinned by a test in the same phase, not deferred to a security pass.

---

### Pitfall 3: Delete-copy promises instant member removal — delete semantics confusion

**What goes wrong:**
Deleting a `group_mappings` row does NOT remove any member today. Removal happens at the members' **next SSO login** through the removal sync with the last-owner/last-operator guards (v3.2 design, groups.js). If the new UI's confirm dialog says "Delete mapping and remove 12 members", operators will delete the mapping and expect immediate emptying of the workspace, then file "it didn't work" bugs — or worse, expect the mapping delete to be undoable because no access changed. Conversely, if the copy says nothing, an operator deleting a mapping to *revoke* access will not realize the revocation is lazy and a user retains access until they next log in.

**Why it happens:**
CRUD UIs conflate "delete row" with "delete effect". The deferred-revocation model is correct (it's how the existing guard funnel works) but invisible unless the UI states it.

**How to avoid:**
Confirm copy must say exactly: deleting the mapping stops *future* SSO logins from granting this membership/role; current members keep access until their next SSO login, where the removal sync applies (guards still protect the last owner/operator). No "members affected: N now" promise. Delete the row only; never touch `memberships` in the delete handler — the login-time sync is the sole removal mechanism.

**Warning signs:**
Any code in the DELETE route that touches `memberships` or calls `stripMember`; confirm-dialog copy containing "removes members" without "at next login".

**Phase to address:**
Mappings-page UI phase (copy + route scope), verified by a test that deleting a mapping leaves memberships untouched and the login sync still demotes.

---

### Pitfall 4: Unique-index collision surfaces as raw 500 instead of keyed refusal

**What goes wrong:**
`UNIQUE(group_guid, workspace_id)` (db-adapter.mjs:405, server.js SCHEMA mirror) throws `SQLITE_CONSTRAINT_UNIQUE` on duplicate save; pg dialect throws its own error code. A naive save route that only runs `guidRefusal` will let the constraint error escape as an unhandled 500 — violating the house contract that every operator refusal is a `{code,message}` key rendered in 5 locales (the domains.js / groupMappingBadGuid pattern). Worse, both dialects must behave identically (pg-parity suite is a standing gate).

**Why it happens:**
The canonicalization pitfall prevents most duplicates, but a race (two operators pasting the same GUID in different tabs) or a pg-vs-sqlite error-shape difference still reaches the constraint. Developers treat the index as "the DB will handle it" and skip the catch.

**How to avoid:**
The save route pre-checks existence (SELECT on canonical pair) for a friendly `groupMappingDuplicate` refusal AND wraps the INSERT in a try/catch mapping constraint errors to the same keyed refusal — defense in depth. Refusal key lands in all 5 locale catalogues in the same commit (v3.0 rule). Pin parity with one test per dialect asserting identical response shape.

**Warning signs:**
A save route with no try/catch around INSERT; a new error key missing from fr/nl/de/es at commit time (i18n gate will catch dead keys, but only if the key is actually referenced).

**Phase to address:**
Mappings-page backend phase, same commit as the refusal keys.

---

### Pitfall 5: Existence oracle via the mappings list / nav gating

**What goes wrong:**
The page is gated on `oidcEnabled` + operator role ("operator 403"). If the nav shows the section to non-operators based on a config read, or the API answers 403 only when the caller can't see mappings but 200-with-empty for a workspace id that doesn't exist, non-operators can probe workspace/GUID existence. House doctrine since v1.1: unknown-or-unauthorized answers 404, no existence oracle. Also: the delete endpoint must not confirm "mapping X exists but you may not delete it" (403) vs "no such mapping" (404) in a way that leaks GUIDs to non-operators.

**Why it happens:**
"Operator 403" feels natural for a governance page, but the mappings list is tenant-wide data; mixing 403/404 inconsistently creates the oracle.

**How to avoid:**
Server routes: non-operator → same response as if the section doesn't exist (consistent with `requireWorkspace`'s 404 discipline for unauthorized slugs); client nav gate reads `/api/config`'s already-published flags (`oidcEnabled`-style) rather than a new endpoint that reveals more. Never echo the requested GUID back in the refusal.

**Warning signs:**
A route returning 403 with `{ guid }` echoed; nav gating reading an endpoint non-operators can also hit with richer data.

**Phase to address:**
Mappings-page backend phase (route matrix written down before UI).

---

### Pitfall 6: Viewer-role mappings accepted by UI but refused nowhere — the locked decision leaking through a new write path

**What goes wrong:**
Locked decision: mapping roles are owner|admin|member only — no viewer, no instance-role mappings, `kind: 'workspace'` only. groups.js:58 already encodes the strict token list. The new page's workspace picker + role picker must not offer viewer; but the real risk is a write path (API POST with hand-crafted body, future MCP mirror) posting `role: 'viewer'` — if the server funnel only validates shape loosely (or the UI picker omission is treated as "the validation"), a viewer mapping grants view rights to an entire Entra group at next login, silently widening access beyond the locked decision.

**Why it happens:**
UI omission ≠ validation; each new route re-derives validation, and the strict-token funnel exists but is one import away.

**How to avoid:**
Reuse the groups.js role-token funnel (`guidRefusal` pattern) in every write path; server rejects any role outside owner|admin|member and any `kind !== 'workspace'` with a keyed refusal. Unit test: POST with role=viewer, kind=instance → refused, 5-locale keys present.

**Warning signs:**
A role picker including viewer "for completeness"; a write path validating roles with `['owner','admin','member','viewer'].includes(...)`.

**Phase to address:**
Mappings-page backend phase; re-pinned when the MCP mirror (if any) is added.

---

### Pitfall 7: DEPLOY.md "Operator note" sends debuggers down the wrong path (wrong-docs risk)

**What goes wrong:**
The current DEPLOY.md:336 operator note tells operators that Entra sets `email_verified` for tenant-member accounts — i.e., debug first by checking tenant email verification. That was true-ish for the old pinned-tenant-member path; the actual reality is Azure AD work/school tokens **routinely omit** `email_verified` entirely, which is why `OIDC_TRUST_TENANT_EMAIL` exists (server.js:6691–6699). An operator whose SSO fails with "tokens without a verified email fail closed" will follow the note, verify tenant email settings (a dead end — there's nothing to fix there), and give up. The new docs must make `OIDC_TRUST_TENANT_EMAIL` the FIRST diagnostic step for Entra, not tenant email verification.

**Why it happens:**
Docs accrete: the v3.6 code added the opt-in flag, but the prose paragraph written in an earlier milestone still dominates the "operator note" slot readers actually read.

**How to avoid:**
Rewrite the Linking policy section as a decision tree: (1) are you on pinned tenant with work/school accounts → set `OIDC_TRUST_TENANT_EMAIL=true`; (2) guest accounts (`acct=1` or external `idp` claim — server.js:6689 guestShape) → the flag does NOT apply, they still require literal `email_verified: true`, so guests need the email claim issued+verified by the IdP; (3) only after that, check issuer/tenant pinning. Also expand the `.env.example` comment with the exact strict-token list (`true/1/yes/on`) and the guest carve-out, so the comment can't drift from server.js parsing.

**Warning signs:**
Docs describing `email_verified` as "Entra sets it for members" without mentioning omission; any sentence implying the flag covers guests; `.env.example` comment saying "uncomment to trust Entra emails" without the guest caveat.

**Phase to address:**
OIDC docs phase — the rewrite must be verified by re-reading server.js:6673–6715, not by memory; a test asserting the docs contain the guest carve-out is cheap insurance.

---

### Pitfall 8: Azure setup steps missing — operators have the flag but no `ApplicationGroup` claim

**What goes wrong:**
The group-mappings feature is useless if the token carries no `groups` claim. The Entra manifest must set `groupMembershipClaims: "ApplicationGroup"` AND groups must be assigned to the Enterprise Application. These steps are absent from DEPLOY.md today (milestone names them explicitly). Operators will set up mappings, see "UNMAPPED" at every login (>200-overage resolves as UNMAPPED, never empty — indistinguishable from a config failure from the UI), and debug the app instead of the tenant.

**Why it happens:**
Docs written app-side; Entra portal steps are someone else's problem — except for a self-hosted product, the operator IS the admin and has no one else.

**How to avoid:**
The docs phase adds a numbered Azure checklist: manifest edit, Enterprise Application group assignment, where to find the Object-ID GUID (the value operators paste into the new mappings page), and the "UNMAPPED at login means claim absent OR no mapping" diagnostic. Mention the >200-group overage behavior so UNMAPPED isn't misread.

**Warning signs:**
Docs referencing `groups` claim without ever mentioning the manifest key; no GUID "where to copy it from" instruction for the new page's paste field.

**Phase to address:**
OIDC docs phase (same phase as Pitfall 7 — one docs pass).

---

### Pitfall 9: Availability check on page load becomes a network probe per destination — the restore list freezes

**What goes wrong:**
The restore-source picker wants to show which mirrors (s3/ftp/smb/local) hold each archive. The natural implementation calls `probeS3/probeFtp/probeSmb` per row (or per destination) when the restore list page loads. Probes are TCP/TLS/auth round-trips to a NAS or object store: seconds each, serially fatal, and a down SMB host turns the whole restore console into a hanging page — for data the run table already knows.

**Why it happens:**
"Availability" suggests connectivity testing; the mirror-flag doctrine (the milestone's named truth) is overlooked: `uploaded` / `ftp_uploaded` / `smb_uploaded` columns (restore.js:1322) ARE the record of where the archive lives — a run with `ftp_uploaded = 1` is FTP-available by definition, no probe needed to say the *source exists*.

**How to avoid:**
Render source options synchronously from the run-row flags (RESTORE_LOCATION_KEYS derived from those columns — flag is truth). Offer an explicit, user-initiated "check availability" action (button per source) that runs one probe on demand and reports; never probe during list render or during the restore-list hydration. A failed on-demand probe does NOT clear the mirror flag (only the restore-time `mirrorMissing` path does — restore.js:1663+).

**Warning signs:**
An `await probeX` in the list/page-load code path; availability shown as part of row render; page-load timing correlated with destination reachability.

**Phase to address:**
Restore-source UI phase — write the "flags render, probes on demand" contract into the phase spec before code.

---

### Pitfall 10: Restore-source selection breaks local-first ordering and the read-back twin guard contract

**What goes wrong:**
Today the restore pipeline is hardcoded: local archive first, then S3 → FTP → SMB read-back twins in registry order, each guarded by its flag AND config presence, each cleaning its staged tmp on failure (`dropStagedTmp`, restore.js:1650–1691). Adding an operator-selected source naively (e.g., "operator picked SMB, go fetch") skips the local-first ordering, or — worse — reuses `stagedTmp` from a failed earlier fetch, or fetches from a source whose flag is 0 (no sha256 guard on the wrong leg). The sha256 enforcement lives *inside* each staged fetch; bypassing the twin seam for the "chosen" source reintroduces the unverified-archive restore vector the twins were built to close.

**Why it happens:**
Selection UI feels like a routing feature, but the correct seam is "candidate-order filter over the existing guarded legs", not a new fetch path.

**How to avoid:**
Selection reorders/filters the EXISTING twin sequence (still local-first unless local is explicitly excluded, still guarded by flag+config, still `dropStagedTmp` on each failure, still `mirrorMissing → clearMirrorFlag` on seam throw so the funnel releases `restore_lock`). No new download call sites outside the twin pattern. Tests: chosen source unavailable → falls through to next guarded leg (or fails keyed `restoreArchiveMissing`), mirror flag cleared only via the existing path, staged tmp swept.

**Warning signs:**
A new `fetch*ToStaged` call outside restore.js's twin blocks; a selection branch that checks the operator's choice but not the run's mirror flag; `stagedTmp` leaked on the fall-through path.

**Phase to address:**
Restore-source backend phase, before the picker UI ships.

---

### Pitfall 11: Staging-area source switching mid-restore corrupts the run

**What goes wrong:**
The restore staging area (`BACKUPS_DIR/restore-staging/restore-<runId>`, D-89-32) is spent-by-design: extracted once, swept on success/failure. If the source picker allows switching the source after the restore run has begun staging (or if a "retry from different mirror" re-enters the run without re-extracting), the run's archivePath and staged tree diverge — sha256 was verified against the first source's bytes but tables/blobs come from a second, or the staging sweep deletes a tmp the retry expected. The global restore lock makes this worse to reason about: a wedged run holds the lock.

**Why it happens:**
"Pick a source" and "retry" look like the same UI affordance, but a source switch is semantically a NEW restore attempt with a new runId, new staging dir, fresh extraction + sha256.

**How to avoid:**
Source selection is a pre-run decision only: once `restore_lock` is held and staging begins, the source is frozen for that run. "Restore from a different mirror" = cancel/fail the current attempt (which sweeps staging and releases the lock through the existing funnel) and start a fresh run. Never swap `archivePath`/`stagedTmp` on a live run.

**Warning signs:**
UI showing a source dropdown during a running restore; any code path assigning `archivePath` after `extractArchive` has run for the runId.

**Phase to address:**
Restore-source backend phase (run-state machine), surfaced in UI phase as disabled-while-running.

---

### Pitfall 12: New run stage/status values invented — breaking the single upload_failed / restore status semantics

**What goes wrong:**
The run status vocabulary is deliberately narrow: uploads that fail land at stage `upload_failed` — NEVER a generic catch, never a per-destination variant (backup.js:914, 1073 — "the run never lies"); restore failures use the keyed `restoreArchiveMissing` funnel and the existing stage machine. Adding source selection tempts per-source statuses (`ftp_upload_failed`, `restore_source_unreachable`) or a new "checking availability" persisted state. Each new stage value breaks: the badge renderer, the transition-based failure emails, the run-history filters (`?all=1` unified runs), and the mirror-flag clearing logic keyed on specific stages.

**Why it happens:**
Per-destination granularity feels informative; the existing design chose coarse-but-honest on purpose (v3.5 doctrine).

**How to avoid:**
All source-selection detail lives in the ERROR TEXT and the audit trail (`mirror_flag_cleared:<dest>` events already exist, restore.js:1327), not in new stage enums. Failure routes through the existing `failWith(keyed(...))` funnel. If a new state seems needed, first check whether the existing stage + error-text + badge combination can express it.

**Warning signs:**
A new string literal in the stage enum; a migration adding a run-status column; badge code with a new branch.

**Phase to address:**
Restore-source backend phase — stage vocabulary listed as frozen in the plan.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Client-side-only GUID validation | Faster save UX | Dead mappings, unique-index 500s, MCP-mirror drift | Never — server funnel is one import away |
| Per-row bespoke render for the mappings table | Quicker delete repaint | Escaping drift → stored XSS | Never — one template, full repaints |
| Probing all destinations on list load | "Complete" availability column | Restore console hangs when a NAS is down | Never — on-demand probe |
| New per-source run stages | Granular history | Breaks badges/emails/filters | Never — error text carries detail |
| Docs patch appended to the old Operator note | Small diff | Two contradictory paragraphs; wrong first step persists | Never — rewrite the section |
| Skipping pg-parity tests for the new routes | Faster phase | Dialect-specific constraint error shapes diverge | Never — parity suite is a standing gate |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Entra manifest | Assuming `groups` claim appears by default | `groupMembershipClaims: "ApplicationGroup"` + group assignment to the Enterprise App; document both |
| Entra guest tokens | Treating `OIDC_TRUST_TENANT_EMAIL` as covering guests (`acct=1` / external `idp`) | Guests always require literal `email_verified: true` (server.js:6689–6699); docs and tests must pin this |
| Azure AD email claims | Assuming `email_verified` is present on work/school tokens | It's routinely omitted; that omission is why the flag exists — docs must lead with the flag |
| S3/FTP/SMB seams during restore | Calling the client directly for the "chosen" source | Only through the guarded read-back twin pattern (flag + config + sha256 + dropStagedTmp + mirrorMissing clearing) |
| node:sqlite vs pg | Assuming constraint errors have the same shape | Catch both, map to one keyed refusal; parity test per dialect |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Probe-per-row availability | Restore list takes seconds; hangs when a host is down | Flags render synchronously; probe on explicit user action | Immediately with any unreachable destination |
| N+1 label/mapping lookups in the list route | Slow mappings page as rows grow | One JOIN / one query for mappings + workspace names | ~hundreds of mappings |
| Serial probes in the on-demand check | Checking 3 sources takes 3× the slowest | Parallelize the three probes (Promise.all) with per-source timeout | First use against a slow NAS |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Label interpolated raw in any re-render | Stored XSS by/persistent across operator sessions | `esc()` in the single shared template; hostile-label test |
| 403/404 mixing on mapping routes | Existence oracle for GUIDs/workspaces | Uniform 404 discipline for non-operators; never echo requested GUID |
| Viewer/instance-role accepted in a hand-crafted POST | Silent access widening at next SSO login | Strict token funnel in every write path; locked-decision unit tests |
| Mirror flag cleared by a UI availability probe | Restore loses its truthful source record; future restores skip a good mirror | Only the restore-time `mirrorMissing` seam clears flags (restore.js:1663+) |
| Trusting `email_verified` presence on Entra member tokens | Lockout (fail-closed) misdiagnosed as tenant misconfig | `OIDC_TRUST_TENANT_EMAIL` documented as the first step, guest carve-out explicit |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Delete copy promising instant member removal | Operators distrust the feature ("nothing happened") | Copy states lazy revocation at next SSO login, guards intact |
| UNMAPPED-at-login with no diagnostic | Operators debug the app, not the tenant | Docs diagnostic: claim absent vs >200 overage vs missing mapping row |
| Source picker with no availability feedback | Operator picks a dead mirror, restore fails late | On-demand per-source check with clear pass/fail; failure does NOT auto-switch silently without saying so |
| GUID paste field rejecting valid variants | "Microsoft gave me this ID and your form calls it invalid" | Accept braces/uppercase/no-hyphen; canonicalize client-side for preview, server-side for truth |
| Dead mappings left visible with no warning | Orphaned rows accumulate; operators map to deleted workspaces | Surface the existing dead-mapping warning pattern (v3.2 governance card) on the new page |

## "Looks Done But Isn't" Checklist

- [ ] **Mappings save:** duplicate save returns keyed `groupMappingDuplicate`, not 500 — verify in BOTH dialects
- [ ] **Mappings save:** `{braced}` / uppercase / no-hyphen paste collapses to the canonical row — verify a second save refuses
- [ ] **Mappings delete:** memberships untouched; login-time removal sync still demotes with last-owner guard — verify by simulation
- [ ] **Mappings render:** hostile label through poll refresh + locale switch + delete repaint produces zero unescaped sinks
- [ ] **Mappings gates:** non-operator route responses are oracle-free (404-discipline), nav gate reads only published config flags
- [ ] **OIDC docs:** guest carve-out sentence present; Operator note no longer leads with tenant email verification; .env.example lists strict tokens + guest caveat
- [ ] **OIDC docs:** `ApplicationGroup` manifest step + Enterprise App group assignment + GUID location all present
- [ ] **Restore source:** zero probes during page load; flags (`uploaded`/`ftp_uploaded`/`smb_uploaded`) are the only render-time truth
- [ ] **Restore source:** selected source goes through the guarded twin seam (sha256, dropStagedTmp, mirrorMissing → clearMirrorFlag, lock released)
- [ ] **Restore source:** no new stage enums; failures carry detail in error text + audit; restore list run-history filters unbroken

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate/dead GUID rows | LOW | SELECT duplicates by canonical form, delete extras, audit login matches during the window |
| Stored XSS via label | MEDIUM | Fix template, purge hostile labels, check audit/notifications for render-time side effects, rotate if sessions were hijacked |
| Docs mislead operator | LOW | Rewrite section; no code impact |
| Probe-on-load hang | LOW | Move probe to on-demand; no data damage |
| Mirror flag cleared erroneously | MEDIUM | Re-verify the archive exists at that source, restore flag + audit row (pattern exists: `mirror_flag_cleared`) |
| New stage enum shipped | HIGH | Migration back to coarse stages + badge/email/filter regression sweep — avoid by freezing vocabulary |
| Staging/source mid-run swap | HIGH | Cancel run, sweep staging, full re-run from the chosen source; verify lock released |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Raw GUID storage | Mappings backend | Canonical-variant collapse test; grep: all INSERTs through `canonicalizeGuid` |
| 2. Label XSS | Mappings UI | Hostile-label render test across re-render paths |
| 3. Delete semantics | Mappings UI | Delete leaves memberships untouched; login sync test green |
| 4. Unique-index 500 | Mappings backend | Duplicate-save keyed refusal, sqlite + pg parity |
| 5. Existence oracle | Mappings backend | 404-matrix test for non-operator route access |
| 6. Viewer-role leak | Mappings backend | POST role=viewer / kind=instance refused, 5-locale keys |
| 7. Wrong-docs Operator note | OIDC docs phase | Docs-vs-server.js:6673–6715 re-read; guest carve-out pinned |
| 8. Missing Azure steps | OIDC docs phase | Checklist present: manifest, app assignment, GUID source |
| 9. Probe-on-load | Restore source UI | Page-load path contains zero `probe*` calls (grep/test) |
| 10. Twin-seam bypass | Restore source backend | New source leg matches twin guard contract; fall-through + sweep tests |
| 11. Mid-run source swap | Restore source backend | Source frozen at staging start; switch = new runId test |
| 12. Stage-enum inflation | Restore source backend | Stage vocabulary diff empty; failure text + audit carry detail |

## Sources

- Codebase (HIGH confidence, read directly): `groups.js` (canonicalizeGuid:34, guidRefusal:54, role tokens:58), `server.js` (SSO callback email_verified logic:6673–6715, guestShape:6689, boot-frozen destination capabilities:386–441), `export/restore.js` (staging doctrine:23–59, read-back twins:1641–1691, mirrorMissing/clearMirrorFlag:1317–1327, upload arms 2151–2182, 2419–2451), `export/backup.js` (upload_failed semantics:914–1075), `db-adapter.mjs` (group_mappings schema + unique index:390–415), `docs/DEPLOY.md` (current Operator note:332–336, mirror docs:1731–1931), `test/groups-sso.test.mjs` (mock-IdP test patterns).
- Milestone doctrine: PROJECT.md v3.6 goals; v3.2 removal-sync design; v3.5 destination registry / dormant-slot contract; Phase 89 D-89-32 staging rules.
- Community wisdom (MEDIUM, general): hand-rolled-UI escaping conventions; Postgres/SQLite constraint-error shape divergence; Azure AD email claim omission documented widely (corroborates server.js comment).

---
*Pitfalls research for: Entra ID Mappings page, OIDC linking docs, restore-source selection on the Projects Studio zero-dep stack*
*Researched: 2026-11-27*
