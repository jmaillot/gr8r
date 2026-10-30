# Phase 23: Email Deep Links & Creator Watching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 23-Email Deep Links & Creator Watching
**Areas discussed:** Deep-link landing behavior, Sign-in return flow, Creator watcher semantics, SPA routing architecture

---

## Deep-link landing behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Boot then open task | SPA boots fully, resolves task by key, opens in existing task view — one code path | ✓ |
| Minimal render first | Task panel renders alone first, then hydrates — two rendering paths | |
| You decide | Based on researcher findings | |

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace + notice | Workspace view + "task not found" toast — user can navigate on | ✓ |
| Silent redirect to workspace | URL just becomes /w/:slug | |
| Dedicated not-found page | Separate page with link back | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same notice, no leak | Same not-found notice for permission-hidden tasks | |
| Access-denied message | Confirms the task exists | |
| You decide | Based on existing permission checks | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| URL stays on task | URL keeps /w/:slug/task/:key after landing — refresh/share keep working | ✓ |
| URL reverts to workspace | Task panel is just a view state | |
| You decide | | |

**User's choices:** Boot then open task; workspace + notice; URL stays on task.
**Notes:** Permission-hidden handling delegated to the agent.

---

## Sign-in return flow

| Option | Description | Selected |
|--------|-------------|----------|
| ?next= query param | Sign-in reads ?next= and redirects after success; survives server-side redirects | ✓ |
| sessionStorage | Lost in new tabs / server-side redirects | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Local-path allowlist | Only single-"/" paths; reject //, http://, \\ | |
| Known-routes list | Stricter, must be maintained | |
| You decide | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Direct to sign-in | One hop with ?next= set | |
| Follow existing flow | Just carry the path through | |
| You decide | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same ?next= rule | Honor task link after sign-up too | |
| No, sign-up goes home | Always land on dashboard | |
| You decide | | ✓ |

**User's choices:** ?next= query param; all other guard/landing/sign-up questions delegated to the agent.
**Notes:** — 

---

## Creator watcher semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Creator + assignee at birth | Watchers = creator + assignee at creation, deduped | |
| Creator as separate field | Fan-out unions creator + watchers; watcher set untouched | |
| You decide | Based on current watcher storage | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Never self-notify | Nobody is notified about their own action — matches assignee behavior | ✓ |
| Creator gets everything | Watcher set taken literally | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| New tasks only | No backfill of existing tasks | ✓ |
| Backfill existing tasks | Boot migration adds creator to watcher sets | |
| You decide | | |

**User's choices:** Never self-notify; new tasks only; modeling delegated to the agent.
**Notes:** —

---

## SPA routing architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Central route table | Path pattern → handler used by both deep-link boot and internal nav | |
| Popstate + existing nav | Add popstate handler over scattered replaceState calls | |
| You decide | Based on how tangled existing call sites are | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Task now, table extensible | Task detail routable now; mechanism extensible | ✓ |
| Task deep links only | Other views stay non-routable | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| pushState everywhere | Back walks full view history | |
| Mixed, minimal history | push only for task open/close | |
| You decide | Balance history noise vs back usefulness | ✓ |

**User's choices:** Task routable now with extensible mechanism; architecture and history strategy delegated to the agent.
**Notes:** —

---

## the agent's Discretion

- Permission-hidden task handling (lean: same not-found notice, no leak)
- Open-redirect guard for ?next= (lean: local-path-only validation, fallback to workspace root)
- Logged-out deep-link landing (lean: follow existing flow, carry the path through)
- Sign-up return rule (lean: same ?next= rule after sign-in)
- Creator-watcher modeling (lean: creator joins watcher set at creation, deduped with assignee)
- SPA routing architecture (central table vs popstate overlay)
- History strategy (push vs replace balance)

## Deferred Ideas

None — discussion stayed within phase scope.
