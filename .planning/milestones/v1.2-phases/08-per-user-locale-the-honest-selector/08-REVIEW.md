---
phase: 08-per-user-locale-the-honest-selector
reviewed: 2026-10-24T00:00:00Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - DEPLOY.md
  - e2e/french-overflow.spec.mjs
  - e2e/helpers/setup.mjs
  - e2e/locale.spec.mjs
  - .env.example
  - scripts/i18n-scan.mjs
  - server.js
  - src/actions/actions.js
  - src/actions/archive.js
  - src/actions/subtasks.js
  - src/components/task-list.js
  - src/core/api.js
  - src/core/i18n.js
  - src/core/store.js
  - src/core/theme.js
  - src/core/utils.js
  - src/data/seed.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/main.js
  - src/overlays/drawer.js
  - src/overlays/modals.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - src/pages/activity.js
  - src/pages/auth.js
  - src/pages/inbox.js
  - src/pages/settings.js
  - src/shell/layout.js
  - test/activity-verbs.test.mjs
  - test/error-codes.test.mjs
  - test/helpers/server.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-dates.test.mjs
  - test/i18n-locale.test.mjs
  - test/i18n-overlays.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-prefs.test.mjs
  - test/locale-account.test.mjs
  - test/locale-negotiate.test.mjs
  - test/migration.test.mjs
  - test/server-boot.test.mjs
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-10-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

Phase 8 moves the interface language from the shared workspace document (`prefs.lang`) to the account (`users.locale`), adds browser negotiation, a one-time French migration seed, a server error-code translation layer (`tErr`), and re-vocabularizes the activity journal (machine verbs + structured extras). The core design is sound: the PATCH endpoint is whitelisted and CSRF-guarded, mass-assignment is blocked, the legacy `prefs.lang` is stripped on every load path so it cannot re-enter the document, and the negotiation/migration boot order is render-safe. `npm test` passes (431/431) and the new e2e specs pin the important behaviors.

No critical defects found. Four warnings deserve fixes: the locale switch fires twice per user selection (duplicate renders + duplicate account writes) and the render-loop guard the comments claim does not exist in code; a failed locale-chunk load leaves `getLocale()` and the catalogue disagreeing with an unhandled rejection; the server duplicates the client's locale registry and will drift; and cleared repeat/estimate activity extras now render nothing although the catalogue keys and resolvers for "(none)"/"off" exist and are unreachable.

## Warnings

### WR-01: Language switch fires twice per selection — duplicate renders and duplicate PATCH writes; the documented "only when it differs" guard does not exist

**File:** `src/ui/select.js:101-103` (with `src/actions/actions.js:2206-2217` and `src/core/i18n.js:74-80`)
**Issue:** `selectMenu.pick()` dispatches **both** `input` and `change` on the hidden native select, and `events.js` routes both to `IN[el.dataset.in]`. `IN.langSel` therefore runs twice per user pick: two `setLocale()` calls, and — because `setLocale`/`activateLocale` dispatch `projects:locale` **unconditionally** with no "target differs" check — two full re-renders, plus two `PATCH /api/auth/me` writes. The comment in `src/main.js:65-67` ("setLocale only fires when the target locale actually differs") describes a guard that is not in the code. The same double-fire hits `IN.prefSel` (double toast, double save) and every other `data-in` select handler. Two rapid selections can also interleave the two in-flight PATCHes so the server's final `users.locale` may be the earlier choice.
**Fix:** dispatch only `change` in `pick()` (or deduplicate in the events router), and add the missing guard:
```js
// src/core/i18n.js
export async function setLocale(code) {
  const known = LOCALES.some(l => l.code === code);
  const target = known ? code : BASE_LOCALE;
  if (target === locale && catalogues.has(target)) return target; // no-op switch
  ...
}
```

### WR-02: `activateLocale` mutates the locale singleton before the catalogue loads; a failed chunk load leaves a half-switched state with an unhandled rejection

**File:** `src/core/i18n.js:48-65` (with `src/actions/actions.js:2206-2217`)
**Issue:** `locale = target` is set before `await loader()`. If the dynamic `import('../locales/fr.json')` rejects (offline, build without the fr chunk, CDN hiccup), `activateLocale` throws after already mutating the singleton: `getLocale()` reports `'fr'`, the catalogue is missing so `t()` falls back to English, and `documentElement.lang` is never updated (stale). In `IN.langSel` the rejection escapes the async handler as an unhandled promise rejection — no toast, no recovery, and the settings select shows a language the UI is not actually using.
**Fix:** load the catalogue before committing the singleton, and recover on failure:
```js
async function activateLocale(code) {
  const known = LOCALES.some(l => l.code === code);
  const target = known ? code : BASE_LOCALE;
  if (!catalogues.has(target)) {
    const loader = loaders[`../locales/${target}.json`];
    if (loader) {
      try {
        const mod = await loader();
        registerCatalogue(target, (mod && mod.default) || mod);
      } catch {
        return locale; // keep the previous locale intact
      }
    }
  }
  locale = target;
  ...
}
```
Also wrap the body of `IN.langSel` in try/catch so a failure surfaces the existing `toast.localeSaveFailed` instead of an unhandled rejection.

### WR-03: `LOCALE_CODES` on the server is a hand-duplicated copy of the client registry — drift silently degrades the selector

**File:** `server.js:77` (with `src/core/i18n.js:9-12`)
**Issue:** `const LOCALE_CODES = ['en', 'fr']` restates `LOCALES` from `src/core/i18n.js`. When a third locale is added to the client registry, the server keeps answering `400 unknownLocale` for it; the client's "honest selector" will offer the language, `setLocale` applies it for the session, and every switch ends in the misleading "Language not saved — it applies to this session only" toast forever. Nothing fails loudly.
**Fix:** single-source the list. Either derive it from the built locale files on the server (`fs.readdirSync` over the locales directory of the built bundle / a shared manifest), or expose it from `/api/config` and have the client build `availableLocales()` from the server answer in server mode.

### WR-04: Clearing a repeat or estimate logs an activity row with no extra, although the catalogue keys and resolvers for "(none)"/"off" exist and are now unreachable

**File:** `src/actions/actions.js:130-134` (with `src/components/task-list.js:247-259`)
**Issue:** The old writers stored `'off'` / `'none'` when a repeat or estimate was cleared; the new ones store `{}` (no `kind`). `EXTRA_VARS` contains a resolver for `estimateSet` that maps a falsy value to `act.extra.none`, and the `repeatSet` resolver falls back to `act.extra.off` — but neither path is reachable because the writer never emits those kinds with an empty value. Net behavior change: "set repeat on … off" and "estimated … none" history rows lose their qualifier (the verb renders bare), and two catalogue keys are dead.
**Fix:** keep the kind on clear so the existing resolvers run:
```js
else if (k === 'recur') logAct('setRepeatOn', t, { kind: 'repeatSet', id: nv ? nv.toLowerCase() : null });
else if (k === 'estimate') logAct('estimated', t, { kind: 'estimateSet', value: nv || null });
```
with the resolvers treating `null`/`''` as the `off`/`none` branches (guard `RECUR_EXTRA[e.id]` against a null id).

## Info

### IN-01: Triple-duplicated comment block above the activity classifier

**File:** `src/components/task-list.js:139-158`
**Issue:** Three successive comment paragraphs restate the same D-06 rationale (two vocabularies, frozen selection, the `moved`/`removed-a-file` quirks) with slightly different wording — clearly the residue of three edit passes. Future editors will not know which one is authoritative.
**Fix:** keep one paragraph; delete the other two.

### IN-02: Structured extras echo the raw catalogue key when a stored machine id is unknown

**File:** `src/components/task-list.js:241, 246`
**Issue:** `statusMoved` and `prioritySet` build keys as `tMsg('task.status.' + e.from)` etc. `t()` returns the key itself for an unknown id, so a document carrying a retired status id renders the literal string `task.status.archived` inside the activity line instead of falling back gracefully. Same shape for `projStatusSet`.
**Fix:** resolve through a small guard, e.g. `const v = has('task.status.' + e.from) ? tMsg('task.status.' + e.from) : String(e.from ?? '')`, or accept the fallback at the catalogue level with an `other` entry.

### IN-03: `PATCH /api/auth/me` is unthrottled

**File:** `server.js:1265-1276`
**Issue:** Every other write endpoint of consequence sits behind `tooMany()` or role checks; the locale PATCH performs a synchronous DB write per call with no rate limit. An authenticated script can hammer it (harmless in effect, but it is the only unguarded mutation). Low risk since it is authenticated and writes one column.
**Fix:** optional: reuse `tooMany('locale|' + user.id, 30, 60_000)` before the write.

---

_Not verified as defects (checked and found sound):_ the boot order negotiation → account locale → migration seed (`src/main.js:135-220`); `stripLegacyLang` on both load paths (`src/core/store.js:26-29, 45, 180`); the server's mass-assignment guard and locale whitelist (`server.js:1265-1276`); `tErr`'s interpolation safety with full server payloads (`src/core/api.js:60-62`, prototype-safe `Object.hasOwn` in `interpolate`); XSS escaping of verbs, extras and the newly-escaped login error (`src/pages/auth.js:44`, `src/overlays/drawer.js:124`); `uid()`'s move to `crypto.getRandomValues`; the legacy-activity "drop, don't leak" rule; the e2e selectors against the `enhanceSelects` button/listbox rendering.

_Reviewed: 2026-10-24T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
