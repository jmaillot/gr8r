# API Coverage — Phase 34

No external API integration: the phase relocates existing `notifPrefs` state into a
`user_notif_prefs` SQLite table behind first-party GET/PUT routes, and fixes the
in-repo `referencesHidden` redaction matcher — no third-party API, SDK, or service
is integrated (verified: RESEARCH.md "Installation: none — zero new dependencies").
