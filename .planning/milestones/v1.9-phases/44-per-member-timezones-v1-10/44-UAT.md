---
status: complete
phase: 44-per-member-timezones-v1-10
source: [44-VERIFICATION.md]
started: 2026-11-06T18:00:00Z
updated: 2026-11-07T10:30:00Z
---

## Current Test

[testing complete — all 3 tests pass; gap G-44-3 resolved by 44-04 gap-closure plan]

## Tests

### 1. Browser UAT of the tz comboboxexpected: Open Settings > Date & time as a member, type to filter (e.g. 'tokyo'), select with mouse and again with arrow/enter, reload the page. Options show IANA id + city + live GMT offset; selection persists in the member profile after reload; Paris is preselected when no tz stored; a stored legacy label like '(GMT+08:00) Singapore' displays Singapore, not Paris.
result: pass
reported: "User confirmed pass on the deployed app. Follow-up UX note recorded as Test 3: the options dropdown stays open (and shifts layout) after a validated selection — should close on selection."
reported: "Second issue found in local repro: Settings > Date & time rendered the load-failed state — TypeError 're(...).includes is not a function'. tzFilter (44-03) used foldForSearch()'s object return ({text,map}) as a string. Fixed in 8a231de following the palette.js .text discipline; verified in local browser repro (filter 'tokyo' -> Asia/Tokyo, keyboard select -> toast, persistence after reload)."

### 2. Accept or defer review warnings WR-01 / WR-02
expected: Human decision to accept admin-path raw tz storage (WR-01, defense-in-depth — downstream reads funnel through resolveTz) and alias/case preselect degradation (WR-02) as deferred hardening, or schedule a fix phase.
result: pass
reported: "User chose 'Planifier un fix'; gap G-44-3 closed by the 44-04 gap-closure plan (commits 6d218e2, c01ac1b, 57292aa): WR-01 admin doc-PUT now funnels every member tz through resolveTz (undefined→keep, ''→clears, hostile → Paris); WR-02 resolveTz stores canonical ids (aliases accepted, stored canonical — A2 consciously updated), UTC added to the list, preselect pins prove no Paris degradation, localParts equivalence proves claim keys byte-identical. 1038 pass / 1 pre-existing fail."
severity: major

### 3. Fermer le dropdown du sélecteur de fuseau après une sélection validée
expected: Quand l'utilisateur valide une zone (Entrée ou clic), la liste d'options se referme et ne se réaffiche pas ; la mise en page ne bouge pas après la sélection. L'input affiche la zone choisie.
result: pass
reported: "Fixed in 1bf1410 (pushed): la liste ne se monte que quand le picker est ouvert — fermée au chargement et après validation ; la saisie ou ArrowDown l'ouvre, Escape la ferme. Vérifié en repro local (Playwright) : après Entrée, listbox absente du DOM, aria-expanded=false, layout stable. Redéployer pour le voir en production."

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-44-3
  truth: "Every stored tz value reaches members[*].tz only through the resolveTz funnel — including the admin doc-PUT path (WR-01); a stored valid tz always preselects itself in the combobox (WR-02)"
  status: resolved
  resolved_by: "44-04 gap-closure plan executed: 6d218e2 (canonicalizing resolveTz + UTC supplement, WR-02), c01ac1b (funneled admin doc-PUT path, WR-01), 57292aa (preselect + claim-key equivalence pins). A2 consciously changed: aliases accepted but stored canonical. 1038 pass / 1 pre-existing fail (D-74); i18n:scan clean; no new lint errors."
  resolved_at: 2026-11-07
  reason: "User chose to fix both review warnings: WR-01 — server.js admin doc-PUT path writes other members' tz verbatim, bypassing the D-10 funnel (never-stored-raw invariant broken); WR-02 — tz.js resolveTz returns alias/case input raw, so a valid alias schedules fine but tzPreselect fails the canonical-list match and shows Paris, and saving silently rewrites the value."
  severity: major
  test: 2
  artifacts:
    - path: server.js
      issue: "admin doc-PUT branch (~1697-1706) copies incoming tz verbatim for every member — only the self carve-out funnels; fix: funnel-validate each member's tz preserving undefined→keep and ''→clears semantics"
      resolution: "c01ac1b — every incoming member tz (account-backed and doc-only) funnels through resolveTz; undefined→keep stored, ''→clears, hostile/10k strings → Europe/Paris; hostile-PUT tests added"
    - path: tz.js
      issue: "resolveTz returns validated input raw (A2 pin) — canonicalize via Intl resolvedOptions() (per-zone resolution, not enumeration; D-03 intact); supplement gen-timezones.mjs with UTC; update A2 pin consciously"
      resolution: "6d218e2 — resolveTz returns resolvedOptions().timeZone canonical id; A2 pin consciously updated; UTC in generated list + round-trip drift guard; 57292aa pins preselect-not-Paris and localParts equivalence (D-11/D-12 byte-identical)"
  missing: []

## Gaps

- gap_id: G-44-1
  truth: "Combobox renders with live offset labels, filters as you type, keyboard selection saves via toast, and the choice survives reload from members[me].tz"
  status: resolved
  resolved_by: "828b476 — Dockerfile: COPY --from=build /app/tz.js ./tz.js"
  resolved_at: 2026-11-07
  reason: "User reported: deploy crash ERR_MODULE_NOT_FOUND /app/tz.js — Dockerfile runtime stage did not copy the new module created by plan 44-01."
  severity: blocker
  test: 1
- gap_id: G-44-2
  truth: "Combobox renders with live offset labels, filters as you type, keyboard selection saves via toast, and the choice survives reload from members[me].tz"
  status: resolved
  resolved_by: "8a231de — tzFilter: foldForSearch(...).text (the palette.js discipline); local browser repro verified end-to-end"
  resolved_at: 2026-11-07
  reason: "User reported: 'cette page n'as pu être chargée' on the timezone section — TypeError at render, foldForSearch object misused as string in tzFilter."
  severity: blocker
  test: 1
  artifacts:
    - path: src/pages/settings.js
      issue: "tzFilter passed foldForSearch()'s {text,map} object to .includes"
  missing: []
