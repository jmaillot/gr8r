---
status: complete
phase: 31-second-totp-factor
source: [31-VERIFICATION.md]
started: 2026-11-01T20:35:00Z
updated: 2026-11-02T12:45:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Add-factor wizard E2E
expected: Ordered stages (name → password → existing-factor code → QR/verify); localized errors on invalid input; after verify, a new named factor row appears in the 2FA card list.
result: pass
reported_note: "User confirmed the wizard works end-to-end. Follow-up idea raised: email
  confirmation on 2FA method add — deferred, see Deferred Follow-Ups."

### 2. Remove confirm UX
expected: Confirm echoes the factor's escaped name; removal of one of several factors requires a survivor-factor code; the row disappears and the list refreshes from server ground truth.
result: pass

### 3. French rendering
expected: The nine new fr catalogue keys render with correct D-05 typography (apostrophes, spacing) in the 2FA card UI.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Deferred Follow-Ups

- test: 1
  idea: "Envoyer automatiquement un mail de confirmation (alerte sécurité) à l'utilisateur
    lorsqu'une nouvelle méthode 2FA (facteur TOTP) est ajoutée à son compte — et
    symétriquement lors d'une suppression. Réutiliser l'infrastructure mail existante
    (queueNotifEmails) si elle convient."
  deferred_at: 2026-11-02

## Gaps
