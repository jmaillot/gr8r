# Requirements — Milestone v2.4 Automation & Productivity

**Status:** Proposed
**Milestone:** v2.4 Automation & Productivity
**Goal:** automate repetitive work — hierarchical subtasks, task/project templates, and per-project outbound webhooks delivering to Microsoft Teams — while clearing the v2.3 deferred backlog.
**Constraints:** zero new runtime or dev dependencies; standing gates intact (500 kB chunk gate ~2 kB headroom, EN+FR i18n gate, lint, unit suite, e2e 115/115); every new doc shape registered as a mergeClientDoc sink; every new server validator shared across UI/API/MCP; MS Teams target is Workflows webhooks (O365 connectors retired May 2026).

## v2.4 Requirements

### Subtask Tree (SUB)

- [x] **SUB-01**: A task's subtasks render as a multi-level tree in list/table views — indent + collapse carets, board view shows a child-count badge (no nested kanban trees)
- [x] **SUB-02**: A task can be promoted/demoted/re-parented one level at a time; the server rejects cycles and depth overflow at the funnel; children follow their parent on delete per the owner cascade ruling
- [x] **SUB-03**: Completing a parent task auto-completes its open descendant subtasks (owner ruling: cascade auto-done); parent progress is a computed rollup (never double-counting nested progress)
- [x] **SUB-04**: The tree shape survives every existing surface: mergeClientDoc normalization/removal sweeps, FTS projection (optional subtask titles, symmetric SQLite+pg), MSPDI export `OutlineLevel`, xlsx/CSV rows — all with MCP writeDoc round-trip parity

### Templates (TMPL)

- [x] **TMPL-01**: Users can create task templates with ordered subtask checklists and `dueOffsetDays` (never absolute dates); unknown fields are dropped by the template sanitizer
- [x] **TMPL-02**: Users can create project templates with starter task trees and instantiate them — the new project contains the template's task tree with dates derived from offsets
- [x] **TMPL-03**: Templates are workspace-wide (owner ruling: no per-template visibility); creation/edit lives in the existing creation modals via a template picker; instantiation goes through the normal doc-PUT (no fourth write path, no MCP route)

### Project Webhooks (WHK)

- [x] **WHK-01**: A project owner, admin, or project leader can register, edit, and delete per-project webhook hooks (URL, secret, event filter, format) via the UI only — no MCP webhook management (documented); secrets are shown once at creation
- [x] **WHK-02**: Hooks fire on the 8-event vocabulary (task.created, task.completed, task.assigned, task.deleted, comment.added, due.reminder, project.completed, subtask.tree-changed), each hook filtering its own subset; events are computed as a pure `diffWebhookEvents(storedDoc, next)` at the funnel diff point and delivered post-commit fire-and-forget
- [x] **WHK-03**: Delivery is async and fail-absent with bounded retries honoring Retry-After, exactly-once via a claim table shared by design with the SMTP retry (B2); payloads are whitelisted-field envelopes built through `memberCanReadProject` (never caller-scoped serialization) and respect the 28 KB Teams cap
- [x] **WHK-04**: The Teams formatter produces valid MS Teams payloads — per-hook format `teams-adaptive | teams-messagecard | raw-json` targeting Workflows URLs (`*.logic.azure.com`); task.assigned payloads mention the assignee in Teams (real AAD mention when the user logs in via OIDC Entra and their `oid` claim is persisted at login, bold-name fallback otherwise)
- [x] **WHK-05**: SSRF is mitigated at delivery time: https-only URLs, resolved-IP deny-list (loopback, RFC1918, 169.254.0.0/16) checked per delivery, hook config lives only in server mirror tables (`webhook_hooks`/`webhook_deliveries`), never in the client-visible doc; SQLite+pg parity in the same commit

### v2.3 Backlog Polish (POL)

- [x] **POL-01**: Mobile card fields are driven by the existing `hidden[]` column contract — popover hides/shows card fields, minimum-identity fields always visible, proven by a dedicated 390×844 e2e
- [x] **POL-02**: Email notification retry semantics when SMTP is down — claim-state machine (never mark-then-send, never blanket re-drive) honoring the Phase 38 no-double-send invariant
- [x] **POL-03**: WR-01 CSS scoping — `.toolbar { flex-shrink: 0 }` scoped to `.page.flush .toolbar` at ≤900px, board toolbar behavior proven unchanged by the existing suite
- [x] **POL-04**: 64-VALIDATION Nyquist reconciliation — phase 64 validation draft reconciled or formally accepted per audit-milestone §5.5

## Future Requirements (deferred)

- OIDC Entra hardening milestone: additional OIDC features beyond v2.4's `oid`-claim persistence (group→role mapping, SSO-only policy per workspace, SCIM provisioning)
- Drag-and-drop tree reparenting (multi-level, pointer-based) — promote/demote ships first
- Webhook management in the MCP mirror (explicitly absent in v2.4)
- Real file storage (names/sizes only today); realtime collaboration; billing; time tracking

## Out of Scope (explicit exclusions)

- Any new runtime or dev dependency (fetch/node:crypto/stdlib only)
- O365 connector webhook format (`webhook.office.com` — retired May 2026)
- Per-team webhooks (project-scoped only this milestone)
- Weakened assertions, global retries/timeout increases, chunk-gate threshold edits

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUB-01 | Phase 65 | Complete |
| SUB-02 | Phase 65 | Complete |
| SUB-03 | Phase 65 | Complete |
| SUB-04 | Phase 65 | Complete |
| TMPL-01 | Phase 66 | Complete |
| TMPL-02 | Phase 66 | Complete |
| TMPL-03 | Phase 66 | Complete |
| WHK-01 | Phase 67 | Complete |
| WHK-02 | Phase 67 | Complete |
| WHK-03 | Phase 67 | Complete |
| WHK-04 | Phase 67 | Complete |
| WHK-05 | Phase 67 | Complete |
| POL-01 | Phase 68 | Complete |
| POL-02 | Phase 68 | Complete |
| POL-03 | Phase 68 | Complete |
| POL-04 | Phase 68 | Complete |

Coverage: 16/16 requirements mapped ✓
