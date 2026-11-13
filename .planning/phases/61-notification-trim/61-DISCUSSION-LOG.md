# Phase 61: Notification Trim - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 61-Notification Trim
**Areas discussed:** Audit home & ruling flow, Audit content & scope, One-click suppression mechanics, Burst coalescing design

---

## Audit home & ruling flow

| Option | Description | Selected |
|--------|-------------|----------|
| Restore the doc | Restore docs/notification-audit.md from git 85785a2 as canonical ledger | |
| Fresh audit doc | Rebuild the audit fresh from current code as a Phase 61 deliverable | ✓ |
| In-app audit only | Recommendations render in-app, rulings recorded there | |

**User's choice:** Fresh audit doc
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Doc Status cells | Owner edits Status cells directly (Phase 39 D-05 convention) | |
| Via agent, recorded | Rulings happen in conversation with agent; agent records doc + STATE.md | ✓ |
| UI-as-ruling | One-click UI application IS the ruling | |

**User's choice:** Via agent, recorded

| Option | Description | Selected |
|--------|-------------|----------|
| Rulings gate each plan | Placeholder trims in plans; rulings mid-execution | |
| All rulings before planning | Audit + all rulings collected up front, then plan everything | ✓ |
| Infra first, rulings later | Build NOTIF-02/03 mechanism first, rulings slot in later | |

**User's choice:** All rulings before planning

| Option | Description | Selected |
|--------|-------------|----------|
| Audit now, in session | Agent audits fresh, presents candidates table-by-table this milestone | ✓ |
| Doc first, rulings async | Audit doc written first; owner reads offline, returns with rulings | |

**User's choice:** Audit now, in session

---

## Audit content & scope

| Option | Description | Selected |
|--------|-------------|----------|
| Rule each key | Present each dead pref key individually: trim-to-default vs full removal | ✓ |
| Remove-all default | Default = full removal end-to-end unless objected per key | |
| Skip dead keys | Dead keys out of Phase 61, later cleanup milestone | |

**User's choice:** Rule each key

| Option | Description | Selected |
|--------|-------------|----------|
| Full matrix | Full type × channel × default re-audit incl. live push channel | ✓ |
| Trim candidates only | Only channels with trim candidates; email assumed keep | |

**User's choice:** Full matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Audit flags bursts | Audit produces burst candidates; owner rules which classes coalesce | ✓ |
| Generic coalescing | NOTIF-03 designed generically without per-class rulings | |

**User's choice:** Audit flags bursts

| Option | Description | Selected |
|--------|-------------|----------|
| Include as candidate | Ungated `update` type presented as a recommendation row | ✓ |
| Leave ungated | Status-change notifications stay ungated; documented as known-state | |

**User's choice:** Include as candidate
**Notes:** User also requested the discussion continue in French (« peux tu me poser les questions en francais ») — applied from that point on.

---

## One-click suppression mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Suppression workspace | Ruling suppresses the class workspace-wide (new semantics/table) | |
| Défaut workspace, opt-out membre | Ruling changes the class default; members keep individual opt-out | |
| Prefs du propriétaire seulement | One-click applies to owner's own prefs only | ✓ |

**User's choice:** Prefs du propriétaire seulement

| Option | Description | Selected |
|--------|-------------|----------|
| Settings › Notifications | Existing notif-email/notif-push tab pattern hosts the apply surface | ✓ |
| Surface admin dédiée | Separate admin page listing all rulings and their state | |

**User's choice:** Settings › Notifications

| Option | Description | Selected |
|--------|-------------|----------|
| Validés seulement | Apply button only on audit rows with Status `validated` | ✓ |
| Tout afficher, gate serveur | All recommendations shown; server rejects `proposed` clicks | |

**User's choice:** Validés seulement

| Option | Description | Selected |
|--------|-------------|----------|
| Prefs existantes | Click writes user_notif_prefs via Phase 34 mechanism — zero new tables | ✓ |
| Pref + trace | New applied_trims history table alongside the pref write | |

**User's choice:** Prefs existantes

---

## Burst coalescing design

| Option | Description | Selected |
|--------|-------------|----------|
| Rendu inbox | Coalescing at inbox render; server emits one row per notif; zero server changes | ✓ |
| Émission serveur | Server coalesces at emission (burst row + counter in doc); heavier | |

**User's choice:** Rendu inbox

| Option | Description | Selected |
|--------|-------------|----------|
| Par tâche, non lues | Group all unread same-task+same-type notifs; no time window; expandable | ✓ |
| Fenêtre temporelle fixe | Fixed window (e.g. 10 min) groups same-task notifs; older shown individually | |

**User's choice:** Par tâche, non lues

| Option | Description | Selected |
|--------|-------------|----------|
| Inbox seulement | Push and email stay one-per-row (Phase 59 D-14 remains true) | ✓ |
| Inbox + push | Successive pushes replaced via Web Push tag/rename | |

**User's choice:** Inbox seulement

| Option | Description | Selected |
|--------|-------------|----------|
| Compteur + dernière | Summary: count by type + task key + title, clickable to drawer, expandable | ✓ |
| Compteur seul | Count-only summary row, no last-message preview | |

**User's choice:** Compteur + dernière

---

## the agent's Discretion

- Audit doc table wording/section order (Phase 39 shape as reference)
- Where the validated-rulings list for the Settings apply buttons comes from; server-side rejection of non-validated classes permitted as defense-in-depth
- Burst group markup, expand/collapse interaction, i18n keys (EN+FR)
- Whether mark-burst-read marks all entries read
- Audit-doc ↔ code-drift resync policy

## Deferred Ideas

- Workspace-wide notification class suppression — rejected this phase; future capability if ever wanted
- Digest overhaul beyond NOTIF-03 — REQUIREMENTS.md out-of-scope
