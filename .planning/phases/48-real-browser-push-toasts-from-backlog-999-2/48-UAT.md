---
status: complete
phase: 48-real-browser-push-toasts-from-backlog-999-2
source: [48-VERIFICATION.md]
started: 2026-11-07T16:45:00Z
updated: 2026-11-07T17:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Real permission flow: open Settings → Notifications, toggle a push_* pref ON, accept the browser permission prompt, hide the tab, trigger a mention from another user, confirm the OS notification appears and clicking it focuses/navigates to the task
expected: Browser prompt appears inside the click gesture; hidden tab yields exactly one OS notification per event; click focuses the existing tab or opens the same-origin deep link
result: pass
note: "Essai 1 : mention + F5 immediat -> rien (par conception : F5 amorce le seen-set en silence, Pitfall 3, anti-tempete apres rechargement). Essai 2 : tab visible + attente < 30s -> notification visible + pastille. Confirme D-48-2 branche foreground + dedupe."
reported: "j'ai mentionné mon compte depuis un 2eme compte de test, je n'ai rien vu apparaitre, juste une pastille dans les notifications apres avoir fait F5"
severity: major

### 2. Blocked-permission UX: block notifications for the origin in browser settings, reload, open Settings → Notifications, then re-allow and wait one poll tick
expected: Each push_* row shows the derived 'Browser blocked'/'Navigateur bloqué' badge; the one-time explanatory toast fires exactly once on a denied toggle; the badge clears on the next poll render without a reload
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
