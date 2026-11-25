# Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish Settings surfaces (My Access project grid, API Keys revoked-key purge, single-line Workspace URL, selectable Edit-Teams picker), give operators cross-workspace visibility in the Backup & Restore scope pickers ONLY (XWS-01, `workspacesForUser` byte-unchanged), and extend the guarded overwrite restore engine (89-05) to project containment (BKRST-05) — a project archive restores as NEW or as OVERWRITE of an existing project.

</domain>

<decisions>
## Implementation Decisions

### Project Overwrite Restore (BKRST-05)

- **D-01:** Overwrite = TOTAL replacement of the target project. The replaced project's favorites, comments and activity are deleted with it; the archive supplies its own data. The pre-restore workspace snapshot (89-05 idiom) is the disaster-recovery path. — **Reversibility:** costly — deleting live referencing rows (favorites/comments/activity) is destructive; recovery goes through the pre_restore snapshot only.
- **D-02:** Target selection + confirmation: the SAME drawer picker as "Restore as new" gains project-level selection (projects of the chosen workspace), then a confirm-phrase the operator types matching the target project's CURRENT name (89-05 confirmName idiom, server-validated against the live row). Both CTAs offered for project archives: "Restore as new" and "Overwrite".
- **D-03:** Name/slug collision in the target workspace = TYPED REFUSAL (`restoreNameCollision` ×5) naming the conflicting projects. NO auto-suffix — a misleading name is worse than friction.
- **D-04:** The global restore lock (one restore at a time, all triggers) applies unchanged — the pre-restore snapshot semantics demand it. — **Reversibility:** one-way — parallel snapshots on one workspace would corrupt the recovery path.
- **D-05:** Permissions identical to "Restore as new": Super Admin bypass (phase 94 ruling) + Restore Operator with workspace membership; Backup Operator excluded.
- **D-06:** Backup runs of the replaced project stay in the history — the run history is an operational/audit journal, not an index of live data. Only live data is replaced.

### My Access (SET-01)

- **D-07:** Grid of project CARDS with the project's own colored icon (dashboard project-card idiom), replacing the tick icon. Grouped by workspace with a per-group subtitle. Workspaces with NO projects are hidden (no empty groups). Cards are READ-ONLY (no click navigation) — My Access stays an overview.
- **D-08:** Roles shown as a discreet badge on each card where relevant (part of the card content).

### API Keys revoked purge (SET-02)

- **D-09:** Purge button uses the 2-click confirm idiom (ask → confirm, same as apiKeyRevoke); button only rendered when revoked keys exist. Owner's own keys only — the API Keys table is already per-user, no admin broadening.
- **D-10:** Server: purge DELETES the revoked-key rows; the append-only audit trail keeps the purge event (no key values anywhere). After purge the table simply stops showing them; toast confirms "N keys removed".

### Cross-Workspace Pickers (XWS-01) + Edit-Teams (SET-04)

- **D-11:** The Run-now (Backup) workspace picker aligns on the phase-92 scopes payload (same as the restore picker, live-verified in phase 94 rounds 8–11). Navigation and workspace switcher stay byte-unchanged for everyone (`workspacesForUser` grep gate stands).
- **D-12:** Invite Member > Edit Teams uses the SAME contract as Teams > Edit team: mteamToggle chips + teamPickOpen selectable picker (modals.js idiom) — one component, one behavior.

### Workspace URL (SET-03)

- **D-13:** Single line via ellipsis + full URL in a hover tooltip (no marquee).

### the agent's Discretion

- Exact card sizing/spacing for the My Access grid (use existing design tokens)
- Server route shape for the purge endpoint (POST /api/settings/apikeys/purge-revoked or similar) and its rate limit
- Project-overwrite pipeline internal staging (extend restoreOverwriteUnit vs new restoreProjectOverwriteUnit — researcher/planner decide with the researcher's engine read)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Restore engine & guardrails
- `export/restore.js` (restoreOverwriteUnit ~:1353) — the 89-05 guarded overwrite unit: snapshot, confirm-phrase, scope-kind check, ids-verbatim, tx replacement — BKRST-05 extends this
- `server.js` (~:9798 overwrite trigger; ~:9665 Super Admin bypass; ~:9376 frozen ?all=1) — trigger-side guardrails and the restore lock
- `.planning/phases/94-backup-console-ux/94-CONTEXT.md` — drawer picker + Super Admin bypass rulings (rounds 8–11)
- `.planning/phases/92-server-payload-contracts/92-CONTEXT.md` — backupScopeWorkspaces endpoint contract the pickers ride

### Settings surfaces
- `src/pages/settings.js` — my-access section (:517+), apiKeys table + revoke idiom (:823+), workspace URL render
- `src/overlays/modals.js` — mteamToggle chips + teamPickOpen (Edit-team picker contract, :99–104, :501)
- `.planning/phases/93-governance-ux-instance-roles/93-CONTEXT.md` — selectable picker idiom (D-03), roster patterns

### Project requirements
- `.planning/REQUIREMENTS.md` — XWS-01, SET-01..04 wording + explicit out-of-scope exclusions
- `.planning/ROADMAP.md` §Phase 95 — SC-6 (BKRST-05) engine-extension criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `restoreOverwriteUnit` (export/restore.js) — snapshot + confirmName + tx replacement machinery to extend to project containment
- `api.backupScopes()` / phase-92 scopes endpoint — cross-workspace picker payload (already live)
- mteamToggle + teamPickOpen (src/overlays/modals.js) — the Edit-Teams picker contract, direct reuse for invite
- apiKeyRevokeAsk/Confirm 2-click idiom (src/pages/settings.js:838) — purge confirmation reuse
- Project card + colored icon rendering (dashboard page) — My Access grid idiom

### Established Patterns
- All refusals keyed ×5 locales, same commit as emitting code; i18n-scan dead-key gate
- `workspacesForUser` (server.js:1282) byte-unchanged — hard gate for XWS-01
- Append-only audit trail — purge writes an event, never mutates history

### Integration Points
- Drawer restore preview (src/pages/backup.js) — gains project-target selection + Overwrite CTA
- POST /api/backup/restore/overwrite (server.js) — gains project-scope acceptance path
- Settings my-access/apikeys sections — grid + purge button

</code_context>

<specifics>
## Specific Ideas

- Owner's words (round 11): "je veux pouvoir overwrite ou restore as new" — both CTAs in the drawer for project archives.
- The replaced project's backups history is kept: "operational journal, not a live-data index."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 95-Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore*
*Context gathered: 2026-11-24*
