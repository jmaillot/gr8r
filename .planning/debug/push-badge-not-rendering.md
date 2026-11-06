---
status: resolved
trigger: "UAT gaps G-42-5/G-42-6: push toggles show NO 'Coming soon' badge at all, on deployed remote server, EN and FR, after rebuild + force reload"
created: 2026-11-06
updated: 2026-11-06
---

## Current Focus

hypothesis: The deployed server never received the badge code — the feature commits (17180da and 14 others) were never pushed to origin/main, so the server's `git pull && docker compose build` rebuilt the OLD code.
test: Compare local main vs origin/main; verify the built bundle lacks the badge/key.
expecting: Local main ahead of origin by the phase-42 commits; dist bundle contains no pushComingSoon.
next_action: Push commits, redeploy.

## Symptoms

expected: "Coming soon" badge next to the three inert push toggles
actual: Badge completely absent; toggles and section render fine
errors: none
reproduction: Deploy via the documented procedure (git pull on server + docker compose build) and open Settings → Notifications → Push
started: after phase 42-02 deploy test on remote server

## Evidence

- 2026-11-06 — checked: src/pages/settings.js:391-397; found: badge markup present and correct in `case 'notif-push'`, srow (settings.js:78-81) renders desc in `<div class="d">`. implication: source is fine.
- 2026-11-06 — checked: src/locales/en.json:1250, fr.json:1250; found: `settings.notif.pushComingSoon` = "Coming soon"/"Bientôt disponible". implication: catalogue fine.
- 2026-11-06 — checked: src/styles/components.css:496 (.badge), base.css:88 (.faint); found: `.badge` fully styled, `.faint` only sets color — badge would render visibly either way. implication: CSS not the cause; `.badge.faint` is an undocumented (unstyled) modifier combination but harmless.
- 2026-11-06 — checked: src/core/i18n.js:1-60; found: locales are INLINED into the Vite bundle (static `import en from '../locales/en.json'`, glob loaders rewritten at build). No runtime fetch of locale JSON. implication: markup and string live or die together in dist/ — stale bundle removes both.
- 2026-11-06 — checked: `grep -c pushComingSoon dist/assets/*.js` (dist built 2026-11-05 12:00); found: 0 occurrences in both chunks, though the bundle DOES contain sibling keys (`notif-push`, `due_reminder`, `settings.notif.dueReminderDesc`). implication: the local dist predates the badge commit — proves the key/markup is absent from any bundle built before commit 17180da (2026-11-06 11:09).
- 2026-11-06 — checked: `git status -sb`, `git log origin/main..main`; found: local main is **15 commits AHEAD of origin/main**, including every phase-42 commit: 17180da (badge feature), a1ec00a (badge placement pin), 0902f8b, 173be51, etc. implication: **the badge code was never pushed**.
- 2026-11-06 — checked: DEPLOY.md §10 (Updates) and Dockerfile; found: update procedure is `git pull` on the server then `docker compose build` (Dockerfile runs `npm run build` inside the container from the pulled tree). implication: a server rebuild can only ever build what origin/main contains — the user faithfully rebuilt the OLD code. No cache issue at all: cache-forced reload was correct behaviour on a genuinely badge-less bundle.

## Eliminated

- hypothesis: `.badge.faint` CSS combination hides the badge
  evidence: `.badge` has full visible styling (components.css:496); `.faint` only sets `color: var(--text-3)`. Badge would render (slightly dimmed) regardless.
- hypothesis: client t() swallows missing keys into an empty/invisible badge
  evidence: i18n-scan.mjs prebuild enforces every t() key resolves; key exists in both catalogues and is inlined at build; and the bundle check shows the entire badge markup + key absent, not an empty span.
- hypothesis: HTML sanitization strips the badge between render and DOM
  evidence: srow interpolates `d` directly into an innerHTML template with no sanitization; same path renders other descriptions fine.
- hypothesis: browser cache / service worker serving stale bundle
  evidence: no service worker exists (grep src/ public/ index.html); user force-reloaded twice anyway; the server's BUILD INPUT was stale, so cache is moot.

## Resolution

root_cause: The phase-42 commits were never pushed to origin/main (local main is 15 commits ahead). The deployed server builds via `git pull` + `docker compose build` (DEPLOY.md §10, Dockerfile in-container `npm run build`), so the "full rebuild" faithfully rebuilt pre-42 code whose bundle contains neither the badge markup nor the `settings.notif.pushComingSoon` key. Both gaps G-42-5 and G-42-6 share this single root cause. Vite inlines locales into the JS bundle, so there is no scenario where fresh locales meet stale settings.js.
fix: Push the 15 unpushed commits to origin, then on the server: git pull && docker compose build && docker compose up -d. Verify with `grep -c pushComingSoon` against the served bundle, or simply re-run the UAT steps.
verification: Local evidence conclusive (origin/main lacks the feature commits; pre-42 bundle lacks the key). Awaiting user redeploy + re-test.
files_changed: []
