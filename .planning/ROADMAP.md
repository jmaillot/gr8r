# Roadmap — Gr8r Studio

Milestone **v1.2 — Localization** shipped 2026-10-25 (8 phases, 50 plans, 68 tasks). Its full
roadmap, requirements and audit are archived in `milestones/v1.2-ROADMAP.md`,
`milestones/v1.2-REQUIREMENTS.md` and `milestones/v1.2-MILESTONE-AUDIT.md`; phase artifacts live
in `milestones/v1.2-phases/`.

## Position

No milestone is currently planned. Run `/gsd-new-milestone` to scope the next one (v1.3) —
`PROJECT.md` and `RETROSPECTIVE.md` are the starting points.

## Backlog

Carried forward from v1.2's deferred UAT follow-ups (auth zone, likely stubbed — one
investigation phase should cover all three):

### Phase 999.1: Follow-up — Sessions: "disconnect other sessions" does not activate (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 12 verification
**Source phase:** 12
**Deferred at:** 2026-10-25 during /gsd-verify-work 12 session completion
**Follow-ups:**
- [ ] Test 0: Hors périmètre phase 12 (Sessions) : la section Sessions affiche 2 sessions actives (Chrome + Firefox) mais le bouton « déconnecter les autres sessions » ne s'active pas (deferred 2026-10-25)

### Phase 999.2: Follow-up — Password change: new password rejected at login, other sessions not revoked (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 12 verification
**Source phase:** 12
**Deferred at:** 2026-10-25 during /gsd-verify-work 12 session completion
**Follow-ups:**
- [ ] Test 0: Hors périmètre phase 12 (Auth) : le changement de mot de passe répond « Mot de passe mis à jour » mais (1) le nouveau mot de passe ne fonctionne pas à la connexion, (2) les autres sessions restent connectées — l'utilisateur veut une révocation automatique des autres sessions après changement de mot de passe (deferred 2026-10-25)

### Phase 999.3: Follow-up — 2FA QR code is unreadable/fake — implement real TOTP (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 12 verification
**Source phase:** 12
**Deferred at:** 2026-10-25 during /gsd-verify-work 12 session completion
**Follow-ups:**
- [ ] Test 0: Hors périmètre phase 12 (Auth/2FA) : l'authentification à deux facteurs génère un faux QR code illisible — chercher comment implémenter un vrai check 2FA (TOTP standard : secret, URI otpauth://, QR scannable, vérification à 6 chiffres). À corréler avec les bugs Sessions et changement de mot de passe (même zone auth possiblement stubée) (deferred 2026-10-25)
