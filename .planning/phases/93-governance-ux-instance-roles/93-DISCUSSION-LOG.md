# Discussion Log — Phase 93 (Governance UX — Instance Roles)

**Date:** 2026-11-24 · **Mode:** default · **Areas selected:** 4/4

| Area | Decision |
|------|----------|
| Tab structure | **D-01** — one seg, 3 tabs (Super Admin / Backup Op / Restore Op); roster becomes the SA tab; "Instance Roles" card dissolved; rename on the whole section |
| Table columns | **D-02** — User (name+email) · Grants (badges stacked: date + granted-by) · Actions (revoke per grant); one row per user per tab; lean Backup/Restore tabs |
| Pickers & dialog | **D-03** — Edit-team-style selectable list picker with live filter; no-match = honest "no results"; NO user creation from dialog; Grant dialog search actually filters |
| Audit trail | **D-04** — trail lives in the Super Admin tab under the roster; Backup/Restore tabs render without it |

**Deferred:** per-grant history beyond live row; invite-from-dialog; bulk operations.
