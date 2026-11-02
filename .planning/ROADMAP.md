# Roadmap: Projects Studio

## Milestones

- ✅ **v1.6 — Team Access & Federation** — Phases 28-31 (shipped 2026-11-02)
- ✅ **v1.5 and earlier** — see `.planning/milestones/`

## Phases

<details>
<summary>✅ v1.6 Team Access & Federation (Phases 28-31) — SHIPPED 2026-11-02</summary>

- [x] Phase 28: Multi-Team Membership (4/4 plans) — completed 2026-11-01
- [x] Phase 29: Team/Project-Scoped Permissions (4/4 plans) — completed 2026-11-02
- [x] Phase 30: Entra SSO (OIDC) (6/6 plans) — completed 2026-11-02
- [x] Phase 31: Second TOTP Factor (3/3 plans) — completed 2026-11-02

Full details: `.planning/milestones/v1.6-ROADMAP.md`

</details>

## Backlog

### Phase 999.1: Follow-up — Team-derived project visibility (BACKLOG)

**Goal:** Make project visibility derive from team membership for ALL members: a project is
readable by members of its teams (`project.teams ∩ member.teams ≠ ∅`); a project with no team
stays workspace-wide; the Phase-29 explicit scope remains an optional admin restriction on top.
**Source phase:** 29
**Deferred at:** 2026-11-02 during /gsd-verify-work 29 UAT session
**Follow-ups:**
- [ ] Test 1: Visibilité dérivée des équipes pour tout le workspace : un projet est lisible par
    les membres de ses équipes (project.teams ∩ member.teams ≠ ∅) ; un projet sans équipe
    reste workspace-wide ; le scope phase 29 demeure une restriction admin optionnelle
    par-dessus. (deferred 2026-11-02)
