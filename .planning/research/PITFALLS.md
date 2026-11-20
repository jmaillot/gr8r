# Pitfalls Research — Adding Entra ID Group Mapping to gr8r SSO

**Domain:** Entra ID group → workspace-membership/role mapping on an existing hand-rolled OIDC SSO client (JIT provisioning, domain doors, multi-workspace governance, last-operator guard, zero-dependency invariant)
**Researched:** 2026-11-20
**Confidence:** HIGH (claim behaviors are documented Entra semantics; integration pitfalls derived from the v3.x shipped architecture in PROJECT.md)

**Scope note:** these pitfalls are for *adding* group mapping to a working system. The generic OIDC/SSO pitfalls were already paid down in v1.6/v3.0 (pinned tenant, verified-email linking, fail-closed doors). Everything below is about where the new feature touches existing invariants.

---

## Critical Pitfalls

### Pitfall 1: The `groups` claim overage (>`_claim_names` silently ignored)

**What goes wrong:** Entra caps the `groups` claim at ~200 group IDs (or 150 with names). A user past the cap gets *no inline `groups` array* — instead a `_claim_names: { groups: "_groups" }` / `_claim_sources` pointer to a Graph URL. A client that does `token.groups.map(...)` gets `undefined` and treats the user as group-less → every group mapping silently stops applying for exactly the power users (who are in many groups). Worse: if removal-sync is active, a group-less claim reads as "removed from all groups" and can demote/strip the user.

**Why it happens:** works fine with test users in ≤5 groups; only breaks with real org users. The overage is a documented Entra behavior, not a bug.

**How to avoid:** at claim ingestion, detect `_claim_names.groups` and fail-safe: log + treat as "overage — group evidence incomplete" and *skip group-derived grants AND removals* for that login (do not treat as empty). Optionally document the `emitSecurityGroupsUsed` / assigned-roles-only mitigation (tenant-side) in DEPLOY.md. Never let a missing/overage claim trigger removal.

**Warning signs:** e2e tests pass with tiny test groups; a single production tester in a big org reports mappings "don't work"; removal-sync tests only ever exercise explicit group lists.

**Phase to address:** Config ingestion (claim parsing) — and it must be co-designed with removal sync, since the failure mode is a removal, not a no-op.

---

### Pitfall 2: Group Object IDs vs display names, and tenant-dependence

**What goes wrong:** mapping config keyed on group *display names* ("Developers") breaks on rename, duplicates, and across tenants. Keyed on object IDs it's stable — but IDs are tenant-specific GUIDs, so a config copy between a staging and prod tenant silently matches nothing (fail-closed, but mysterious). Also: some apps emit group *names* (if configured `SecurityGroup`/`ApplicationGroup` vs the default SAMAccountName-ish formats), so a config written against one claim format doesn't survive a tenant-side claim-config change.

**Why it happens:** names are readable and tempting; GUIDs are copy-paste from Entra portal and get lost in config review.

**How to avoid:** map on Object IDs only, validated at boot (GUID shape check, strict-token parse like the v3.0 tri-state env pattern); refuse boot or warn loudly on malformed IDs. Store the display name alongside the ID *as a comment/label only*, never as the match key. Document that mappings are tenant-pinned.

**Warning signs:** a mapping "stops working" after an Entra-side group rename; duplicate group names in the tenant; someone pastes a staging config into prod.

**Phase to address:** Config ingestion (mapping config schema + boot validation).

---

### Pitfall 3: Claim lands in the ID token but not the access token (or vice versa)

**What goes wrong:** Entra group-claim config is per-application and per-token-type. Teams configure "ID token" only, then later add a server-side check that reads groups from the *access token* (or from the userinfo-style refresh path) and get nothing. Conversely, claims added to access tokens for a multi-tenant/implicit setup can bloat tokens past header/proxy size limits (431 errors at Traefik — gr8r's actual reverse proxy).

**Why it happens:** gr8r's hand-rolled client validates/uses the ID token for identity; the milestone naturally reads groups from the ID token callback. The trap is *later* code paths (reconcile, MCP, session re-assert) reading a different token.

**How to avoid:** pick ONE source of truth — the ID token at the SSO callback, matching the snapshot-at-login design — and centralize claim extraction in a single function. Never read groups elsewhere. Keep token size in mind: if many groups are emitted, the callback POST/cookie can balloon; groups are used server-side only and never mirrored into the session cookie.

**Warning signs:** two different code paths extracting `groups`; a session that "loses" operator rights on some endpoints but not others; Traefik returning 400/431 on login for group-heavy users.

**Phase to address:** Config ingestion (single extraction point, contract test on token source).

---

### Pitfall 4: Transitive membership surprise (DirectAssignments / transitive vs direct)

**What goes wrong:** the default `groups` claim includes *transitive* memberships (via nested groups); a tenant-side toggle (`DirectAssignments`-style application-assignment filter or claim config) changes this. A mapping built assuming "users in group X directly" behaves differently after an admin toggles nested-group semantics — users gain or lose access without any app change. ApplicationGroup/assigned-roles emission also changes what appears.

**Why it happens:** the app can't tell direct from transitive in the claim; the difference lives entirely in tenant config the app doesn't control.

**How to avoid:** treat the claim as opaque evidence ("Entra says this user is in these groups"), don't model direct/transitive in app logic. Document in DEPLOY.md that nesting semantics are tenant-controlled. Don't build deny-mappings (group X *excludes* you) — transitivity makes deny-lists unpredictable; gr8r's model is admission-by-mapping only, keep it that way.

**Warning signs:** access changes reported "out of nowhere" after an Entra reorganization; nested-group test scenarios never covered in tests.

**Phase to address:** Mapping resolution (opaque-claim policy) + DEPLOY.md documentation in the same phase.

---

### Pitfall 5: Removal sync strips the workspace owner or the last operator

**What goes wrong:** group-driven removal runs at login: user removed from group → membership deleted/demoted. But (a) a group-mapped user was made workspace *owner*; group removal deletes the membership and orphans the workspace (v3.1 explicitly built orphan-reassignment for this — triggering it via sync is still a governance incident); (b) group removal demotes/removes the *last operator* on the instance — the v3.1 last-operator guard exists for manual demotion, and a naive sync path bypasses it.

**Why it happens:** sync is a new write path into memberships; the guards live in the manual-edit endpoints, not in a shared funnel.

**How to avoid:** route every group-derived membership change through the same guard funnel as manual edits (last-operator refused, owner-removal refused → leave the user with a documented "kept despite group removal" state + log, exactly like existing immunity rows in v3.0). Group sync must be *admission* (can grant) never *forced revocation past guards*. Snapshot-at-login means the demotion applies at next login — a mid-session operator who lost group membership keeps working until re-login; that is the intended semantics, state it explicitly.

**Warning signs:** a sync code path that calls membership/role mutations directly instead of the guard funnel; tests for sync that never exercise a sole-operator scenario.

**Phase to address:** Removal sync — the core pitfall of this milestone.

---

### Pitfall 6: Cyclic / self-referential operator mapping

**What goes wrong:** operator *editing* of the group→operator mapping (from the governance console) can lock everyone out: the operator maps a group they're not in, demotes the only group granting operator rights, or maps a group to a role that can't edit mappings. No check prevents the last path to operator power from being deleted in one edit.

**Why it happens:** mapping config is data; nothing recomputes "can the instance still be administered" after an edit.

**How to avoid:** validate mapping edits against the same last-operator logic as v3.1 demotion: refuse an edit that would leave *no* surviving path to operator (no group with operator rights AND no manually-flagged instance admin). Because manual `is_instance_admin` flags exist as an independent seat (v3.1, D-114 break-glass), the rule can be: refuse only if BOTH no manual operator AND no group-mapped operator path remains. Log every mapping edit to the audit trail (AUD precedent).

**Warning signs:** mapping edit endpoint lacking a "would anyone still be an operator?" check; no audit rows for mapping changes.

**Phase to address:** Removal sync + governance editing (validation must exist before mapping edit UI ships).

---

### Pitfall 7: Group mapping evaluated in the wrong order relative to domain doors (JIT)

**What goes wrong:** the v3.0 door matrix gates JIT provisioning (DP-4 fresh-provision arm). Group mapping *also* admits users. If group mapping is evaluated before/outside the domain doors, a user in a mapped group but on a non-allow-listed domain gets provisioned (door bypass); if doors run first and the mapped group was supposed to be the admission path for an external domain, the user is refused and mapping never applies. Double-negative variant: a user passes the domain door, but the mapped group also gates a workspace — and the code assumes "mapped ⇒ provisioned" without re-checking doors.

**Why it happens:** two parallel admission concepts (owner ruling: "group match is a parallel admission concept beside the domain door matrix, which is unchanged") — parallel means both must pass for JIT, which is easy to implement as either-or by accident.

**How to avoid:** make the ordering explicit and owner-ratified: domain doors remain the *provisioning* gate (unchanged, DP-4); group mapping only decides *workspace membership + role* for users who exist. Group matching never substitutes for a domain door; a mapped group on a non-matching domain does not provision. Encode this as a boot-matrix log line (D-11 precedent: combined 5-door log → now 6-row with group mapping state).

**Warning signs:** an e2e scenario missing for "mapped group + blocked domain"; the door-matrix boot log not extended; tests where mapping alone provisions a fresh account.

**Phase to address:** Mapping resolution (JIT ordering), verified in the same phase with the door-matrix contract test.

---

### Pitfall 8: Slug rename breaks links, clients, and mapping targets

**What goes wrong:** the deferred v3.1 feature — renaming a workspace slug from /governance — breaks: notification deep links `/w/:slug/task/:key` (already emitted, unclickable), MCP client configs, browser bookmarks, `/next=` carries, and any mapping config that targeted workspaces by slug. Rename collisions hit the `slug unique` constraint.

**Why it happens:** slug is the public address AND the config key. Renaming is a data edit with URL-shaped blast radius.

**How to avoid:** (a) mapping config must reference workspaces by stable ID, never slug — resolve slug→ID only for display; (b) rename keeps the old slug as a redirect (301 or internal redirect preserving `?next=` paths) for at least the notification-link lifetime, or explicitly documents old links die; (c) collision = keyed localized refusal (same 5-locale pattern as every v3.x refusal, same commit); (d) tokenize/validate slug input with the same canonicalization funnel discipline as `canonicalizeDomain` (v3.0).

**Warning signs:** governance UI binding mappings to slug strings; no redirect handler test after rename; rename endpoint without collision handling.

**Phase to address:** Governance editing.

---

### Pitfall 9: Deleted/renamed Entra group leaves a dead mapping

**What goes wrong:** a group is deleted in Entra; its object ID no longer appears in any claim. With removal-sync, all its mapped users lose membership/role at next login — potentially the operator path (see Pitfall 5). With fail-closed no-op handling instead, the mapping silently does nothing and nobody knows. Display-name-labeled mappings make it worse: the label still shows a plausible name for a dead ID.

**Why it happens:** gr8r deliberately has no Graph SDK, so it can never *query* Entra to learn the group died. The claim is the only evidence.

**How to avoid:** accept that dead mappings are undetectable server-side (constraints-first: document it). Mitigations that fit the zero-dependency design: (a) boot/warning surface in the operator console listing mappings with "never matched any login in N days" (weak evidence, honest about it); (b) removal-sync changes must be auditable — audit log rows for every group-derived grant/demotion with the group ID, so an operator can diagnose after the fact; (c) DEPLOY.md runbook: "a mapping whose group was deleted demotes at next login — guards still apply."

**Warning signs:** audit trail lacking group-derived changes; no operator visibility into mapping effectiveness.

**Phase to address:** Removal sync (audit rows) + governance editing (mapping list UI).

---

### Pitfall 10: Self-removal / self-demotion mid-session confusion

**What goes wrong:** an operator logs in, group sync demotes them (they were removed from the operator group in Entra), and they're mid-edit in the governance console — subsequent API calls 403 and the UI half-works, or worse they're removed from the workspace whose page is open. The SPA has no "your access changed" handling; stale UI silently fails.

**Why it happens:** snapshot-at-login means changes land exactly at the transition into a session; the client built pre-mapping assumes stable access within a session.

**How to avoid:** follow the v1.3 precedent — the central mid-session 401 teardown exists for revoked sessions; add the analogous handling for demotion (403s on formerly-allowed endpoints trigger a clean "your access changed, re-authenticating" path rather than scattered broken UI). Keep the snapshot semantics (no mid-session revocation) — the demotion happens *at login*, so the worst case is the first requests after login; make login-time sync apply before session issue, atomically.

**Warning signs:** sync applied after session cookie issuance; no 403 recovery path in the client; governance console assuming per-request role re-checks exist.

**Phase to address:** Removal sync (ordering) + a client-side recovery path in the same phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Mapping config keyed on group display names | Human-readable config | Renames/duplicates silently break; cross-tenant copies mismatch | Never — Object IDs only |
| Treating missing `groups` claim as empty array | Simple code | Overage users silently lose all mappings; removal-sync may demote them | Never — must be "unknown/incomplete" state |
| Direct membership mutations in sync path | Faster to build | Bypasses last-operator/owner guards; two permission code paths diverge | Never — shared funnel |
| Mapping workspaces by slug in config | Easy to author | Slug rename breaks mappings | Never (slug = display only) |
| No audit rows for group-derived changes | Less noise | Undiagnosable "why did I lose access?" incidents | Only if explicitly deferred with owner sign-off |
| Periodic background reconcile job instead of login-time | "Fresher" data | New scheduler surface, Graph dependency pressure, violates snapshot-at-login design | Never (owner ruling: snapshot-at-login) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Entra tenant claim config | Configuring the `groups` claim only for ID tokens, then reading access tokens elsewhere | One extraction point in the SSO callback; contract test pins the token source |
| Entra group object IDs | Copying IDs from the wrong tenant (staging/prod) | Boot-validate GUID shape + log a mapping-match matrix at first login |
| Entra overage (`_claim_names`) | Not handling it at all | Detect pointer claims; skip grants AND removals, log loudly |
| Traefik (gr8r's proxy) | Token/cookie bloat from emitting many groups to the client | Groups used server-side only; never mirrored into cookies |
| Graph (NOT used — by design) | Temptation to "just check" group state via Graph API | Violates zero-dependency invariant; stay claims-first, document the blind spots honestly |
| SPA client | Assuming role/membership stable within a session | 403-demotion recovery path mirroring the 401 teardown precedent |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Mapping on group display names from the claim | Spoofable/confusable names grant operator rights | Object IDs only; IDs are unguessable tenant GUIDs |
| Group mapping as JIT provisioning bypass | Mapped user on non-allow-listed domain provisions | Doors remain the provisioning gate (owner-ratified ordering); mapping only assigns membership post-existence |
| Deny-mappings (group X excludes) | Transitive membership makes deny unpredictable; lockout vector | Admission-only model; no exclusion semantics |
| Group claim trusted from a non-validated token | Forged/relay token grants operator | Reuse the v1.6 pinned-tenant RS256/JWKS validation — group extraction strictly downstream of signature+issuer validation |
| Silent fail-open on malformed mapping config | Unknown state grants access | Strict-token boot parse (v3.0 tri-state precedent): invalid = boot-refuse |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Removed from workspace" with no explanation | User lost access, thinks account broken | Audit trail + operator-visible mapping list; the await-access page pattern from v3.1 for refused JIT |
| Operator demoted at login with no warning | Mid-edit 403s look like bugs | Clean "access changed" client path; snapshot semantics documented |
| Mapping config shows GUIDs only | Operators can't maintain config | Display-name labels alongside IDs (labels informational only) |
| Silent no-op when no group matches | User waits for access that never comes | Fail-closed = today's behavior (unmapped users unchanged) — but log mapping-miss at login for diagnosis |

## "Looks Done But Isn't" Checklist

- [ ] **Claim ingestion:** overage (`_claim_names`) handled — verify a fixture with a pointer-claim token produces "incomplete", not "no groups"
- [ ] **Claim ingestion:** claim read from exactly ONE token type — grep proves no second `groups` extraction site
- [ ] **Mapping resolution:** mapped group + non-allow-listed domain does NOT provision — e2e exists
- [ ] **Mapping resolution:** boot-matrix log extended to include group-mapping state (D-11 successor)
- [ ] **Removal sync:** sole operator removed from operator group is NOT demoted (guard funnel shared with manual edit) — test exists
- [ ] **Removal sync:** workspace owner removed from mapped group is NOT orphaned — test exists
- [ ] **Removal sync:** every group-derived change writes an audit row with group ID
- [ ] **Removal sync:** sync applies before session issuance, atomically
- [ ] **Governance editing:** mapping edit refused when it would leave zero operator paths
- [ ] **Governance editing:** slug rename collision → keyed refusal in all 5 locales, same commit
- [ ] **Governance editing:** mappings reference workspace IDs, not slugs
- [ ] **Governance editing:** old-slug links behavior decided (redirect or documented death) and tested
- [ ] **All new refusal keys in en/fr/nl/de/es in the same commit** (standing v3.x gate)
- [ ] **Zero new dependencies** (no Graph SDK) — package.json untouched

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Overage-caused mass demotion | MEDIUM | Re-add memberships manually / script against `memberships`; fix overage handling; re-login users |
| Last operator demoted by sync | LOW | D-114 break-glass manual DB update (existing documented fallback) + restore mapping |
| Owner orphaned by sync | LOW | v3.1 operator console already reassigns orphaned members |
| Dead mapping silently failing | LOW | Re-add corrected group ID in config; audit log reveals when it last matched |
| Slug rename broke links | MEDIUM | Add redirect route retroactively; regenerate affected notification emails impossible — accept dead old links |
| Lockout via cyclic mapping edit | LOW | Break-glass operator flag (D-114) + correct the mapping |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Overage / `_claim_names` | Config ingestion | Fixture token with pointer claim → "incomplete" state, no removals |
| Object IDs vs names; tenant-pinning | Config ingestion | Boot GUID validation; strict-token boot-refuse test |
| Single token source for claims | Config ingestion | Contract test + grep-level single-extraction check |
| Transitive membership opacity | Mapping resolution | No deny-mapping semantics; DEPLOY.md section exists |
| JIT ordering vs domain doors | Mapping resolution | e2e: mapped group + blocked domain refused; boot log extended |
| Owner/last-operator stripped by sync | Removal sync | Guard-funnel shared with manual edits; sole-operator + owner e2e |
| Audit rows for group-derived changes | Removal sync | Audit test per sync mutation |
| Sync ordering vs session issuance | Removal sync | Sync-before-session test; 403 recovery path in client |
| Dead mapping handling | Removal sync + Governance | Audit trail; operator mapping-list surface |
| Cyclic operator-mapping lockout | Governance editing | Edit-refusal test: zero surviving operator paths rejected |
| Slug rename (collision, links, mapping keys) | Governance editing | Collision refusal 5-locale; mappings keyed by ID; redirect test |

## Sources

- Microsoft Entra ID official docs: `groups` claim configuration, overage/`_claim_names` behavior, optional-claims per-token-type semantics (Microsoft identity platform documentation — HIGH confidence, stable documented behavior)
- gr8r PROJECT.md: v1.6 SSO architecture, v3.0 door matrix & boot-log precedent, v3.1 operator/last-operator guards, orphan reassignment, standing zero-dependency and 5-locale gates (HIGH — direct from shipped record)
- Entra SSO community wisdom on group-claim gotchas (overage, transitive membership, rename breakage) — MEDIUM, consistent with official docs
- Integration pitfalls derived from the v3.2 milestone-context surfaces (removal sync × guards, mapping × doors, governance editing) — design analysis, not external sources

---
*Pitfalls research for: v3.2 Entra group mapping & governance backlog — gr8r (Projects Studio)*
*Researched: 2026-11-20*
