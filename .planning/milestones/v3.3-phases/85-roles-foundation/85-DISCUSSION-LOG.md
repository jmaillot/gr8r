# Phase 85: Roles Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 85-Roles Foundation
**Areas discussed:** Role vocabulary & tiering, Backup surface visibility, Implicit membership edges, Instance Roles tab placement & UX, Capability naming

---

## Role vocabulary & tiering

| Option | Description | Selected |
|--------|-------------|----------|
| CHECK-constrained enum | role TEXT CHECK in ('backup_operator','restore_operator'); widen later via rebuild-migration pattern | ✓ |
| Free-form slugs | Any TEXT slug; role→capability map only in funnel | |
| Three roles upfront | Design Backup/Restore Operator + Archive Reader now | |

| Option | Description | Selected |
|--------|-------------|----------|
| Capability constants | Named CAP_* constants in the funnel; pin test asserts Restore Operator ≠ ARCHIVE_READ | ✓ |
| Capabilities column now | JSON capabilities column on role rows | |
| Comment only | Design-note comment; no code encoding until Phase 90 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Capability-level API | hasInstanceRole(userId, capability); Super-Admin short-circuit; callers never see slugs | ✓ |
| Role-level API | Funnel returns role; callers map to permissions | |

| Option | Description | Selected |
|--------|-------------|----------|
| i18n labels only | 5-locale keyed labels/refusals; no DB catalog | ✓ |
| DB role catalog | Display names/descriptions per locale in DB | |

| Option | Description | Selected |
|--------|-------------|----------|
| Row per role | One row per (user_id, role); both roles = two rows | ✓ |
| Bitmask / packed column | Single row per user with packed roles | |

| Option | Description | Selected |
|--------|-------------|----------|
| With granted_by | id, user_id, role, granted_by, granted_at — Phase 80 conventions + dual mirror + pin test | ✓ |
| Minimal columns | user_id, role, granted_at only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pin the distinction | Pin test: no map entry leaks ARCHIVE_READ in Phase 85 | ✓ |
| Defer pin to Phase 90 | Ordinary unit tests; tiering pinned when real | |

| Option | Description | Selected |
|--------|-------------|----------|
| Direct query, no cache | Per-call indexed lookup; revocation on next load | ✓ |
| In-memory TTL cache | Faster hot routes; revocation timing TTL-dependent | |

| Option | Description | Selected |
|--------|-------------|----------|
| roles.js module | Domain module alongside groups.js; pure logic, unit-tested (Phase 80 split) | ✓ |
| Inline in server.js | Near D-112 helpers; no new module yet | |

| Option | Description | Selected |
|--------|-------------|----------|
| Operator route family | GET/POST /api/auth/operator/instance-roles, DELETE .../:id; Phase 83 D-05 guard order | ✓ |
| Extend existing endpoints | Role actions on operator users/workspace routes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Audit funnel row | Audit row via Phase 80-82 mapping grant path helper (BKROLE-03) | ✓ |
| logInfo line only | Lighter governance precedent (Phase 83 rename) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse Super-Admin grants | Keyed refusal; implicit holders must not get rows | ✓ |
| Allow, funnel ignores | Redundant but harmless row | |

| Option | Description | Selected |
|--------|-------------|----------|
| No self-guard | Roles never affect Super Admin authority | ✓ |
| Self-action refusal | Refuse acting on own user id | |

| Option | Description | Selected |
|--------|-------------|----------|
| Operator user list only | Target pool = D-121 operator users; no new enumeration surface | ✓ |
| Free lookup by email/id | Broader; needs own throttle/leak discipline | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cascade on user delete | ON DELETE CASCADE via user_id FK | ✓ |
| Keep orphan rows | Preserve forensic history; ghost rows | |

**Notes:** User requested extended exploration (multiple "more questions" rounds); edges covered above were all resolved by recommendation adoption.

---

## Backup surface visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Real page + empty state | Gated nav entry + real page; routes and gates exist now; criterion 1 testable | ✓ |
| Nav entry only | Route unbuilt until Phase 86 | |
| API-only this phase | UI visibility wired in Phase 86 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level nav entry | Whole-instance capability, server-gated via payload flags | ✓ |
| Inside Governance | Grouped with operations, but governance is operator-only | |

| Option | Description | Selected |
|--------|-------------|----------|
| One shared surface | Restore Operator same page; gated actions inside | ✓ |
| Two entries | Separate Backup/Restore nav entries | |

| Option | Description | Selected |
|--------|-------------|----------|
| Server payload flags | canBackup/canRestore derived from hasInstanceRole; no client role logic | ✓ |
| Raw roles to client | Client decides visibility from slugs | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stub task endpoints | GET /api/backup/tasks returns []; refusal path has real endpoints | ✓ |
| No endpoints yet | Unit-level refusal testing only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Next-load removal | Flags recompute per load (criterion 1) | ✓ |
| Live revocation | Server push — nothing comparable exists today | |

| Option | Description | Selected |
|--------|-------------|----------|
| 403 + keyed refusal | New keyed message, err.operatorOnly-style | ✓ |
| Silent redirect | Hides why | |

| Option | Description | Selected |
|--------|-------------|----------|
| Full e2e set | Grant/revoke visibility, refusal matrix, deep-link 403 | ✓ |
| Minimal e2e | Smoke + unit; refusal matrix in Phase 86/87 | |

| Option | Description | Selected |
|--------|-------------|----------|
| All 5 locales now | Nav label, title, empty state, all refusals | ✓ |
| EN now, sweep in 90 | Locale sweep deferred | |

| Option | Description | Selected |
|--------|-------------|----------|
| src/pages/backup.js | governance.js patterns; chunk-gate if size demands | ✓ |
| Fold into existing page | Fewer files | |

| Option | Description | Selected |
|--------|-------------|----------|
| Flags in stub response | Stub GET carries capability flags for Phase 86/87 contract | ✓ |
| User payload only | Tasks endpoint stays task-shaped | |

**Notes:** User explored thoroughly (8 questions) before moving on.

---

## Implicit membership edges

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit rows only | List = explicit rows joined to operator user list; implicit lives in funnel | ✓ |
| Show implicit greyed | Merged list with implicit badge — contradicts criterion 3 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Short-circuit in funnel | isInstanceAdmin ⇒ true before any table lookup; rows can never demote | ✓ |
| Flag + table union | Authority from both; guard rows can't reduce | |

| Option | Description | Selected |
|--------|-------------|----------|
| Super-Admin-only grants | is_instance_admin gate on grant/revoke routes | ✓ |
| Backup Operator grants | Self-perpetuating loop; contradicts criterion 2 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pin implicit semantics | Pin test: zero-row operator holds everything; no implicit entry in lists | ✓ |
| e2e only | Covered by criterion 3 scenario | |

**Notes:** None — all recommendations adopted.

---

## Instance Roles tab placement & UX

| Option | Description | Selected |
|--------|-------------|----------|
| Tab on /governance | New tab/card on operator /governance page (Phase 78/83 consolidated surface) | ✓ |
| Separate page | Dedicated route; fragments consolidated surface | |

| Option | Description | Selected |
|--------|-------------|----------|
| Table + grant modal | Membership table + picker modal from operator user list (Phase 84 picker pattern) | ✓ |
| Inline in users card | Role controls in user-management card | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline confirm | D-90 inline-confirm + toast; low-stakes reversible | ✓ |
| Confirm dialog | Dedicated dialog like archive confirm | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keyed duplicate refusal | Refuse + highlight existing row; other role grantable | ✓ |
| Idempotent grant | Silently succeeds | |

| Option | Description | Selected |
|--------|-------------|----------|
| Recent-activity section | Compact audit rows footer/expandable (Phase 83 warning-section pattern) | ✓ |
| No in-tab audit | Pure membership editor | |

| Option | Description | Selected |
|--------|-------------|----------|
| Name + relative time | granted_by display name (id fallback), relative granted_at | ✓ |
| Minimal columns | Target + role only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Standard empty state | "No instance roles granted yet" + Grant button front and center | ✓ |
| Empty state + explainer | Educational copy in 5 locales | |

**Notes:** User selected "Explore more" after this area, leading to the Capability naming round.

---

## Capability naming

| Option | Description | Selected |
|--------|-------------|----------|
| Four-constant set | BACKUP_MANAGE, RESTORE_USE, ARCHIVE_READ (defined, granted to NO role — reserved for Phase 90), INSTANCE_ROLES_MANAGE (never granted) | ✓ |
| Two constants now | Only currently-exercised capabilities | |

| Option | Description | Selected |
|--------|-------------|----------|
| That exact map | backup_operator ⇒ [BACKUP_MANAGE]; restore_operator ⇒ [RESTORE_USE]; ARCHIVE_READ mapped to no role; pin test asserts | ✓ |
| Grant ARCHIVE_READ to backup | Pre-commits Phase 90 tiering | |

**Notes:** Pinning exact names so Phase 86/87 routes use identical vocabulary.

---

## the agent's Discretion

- Exact payload flag names (canBackup/canRestore indicative)
- Exact i18n key wording (keyed vocabulary applies)
- Role badge / grant modal visual treatment (mirrors assignee picker)
- Chunk-gating decision for src/pages/backup.js
- Audit funnel event naming for grants/revokes

## Deferred Ideas

None — discussion stayed within phase scope.
