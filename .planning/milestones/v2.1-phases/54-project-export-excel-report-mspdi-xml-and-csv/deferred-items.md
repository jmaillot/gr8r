
## 54-02 — deferred (out of scope, pre-existing on main before this plan)

- `npm run lint` fails on HEAD (50 errors across unrelated files: db-adapter.mjs no-undef process/console ×10, test/browser-push.test.mjs no-undef document/localStorage/Notification, mailer.js no-control-regex, e2e/teams.spec.mjs + several test files no-unused-vars, server.js TZ_BY_LABEL/empty block, context-menu.js canManageProject no-undef). Verified pre-existing by running eslint on db-adapter.mjs with the HEAD config (same 10 errors). Not caused by 54-02; the touched files (eslint.config.js, test/dependencies.test.mjs, test/export-prohibition.test.mjs, test/helpers/*.mjs) lint clean and export/**/*.js node globals are recognised.
  status: acknowledged

## Wave-2 gate observations (2026-11-10, orchestrator)

- Post-merge gate findings resolved, none outstanding: the wave-1 failures were the six
  stale pins (fixed 2562071) and the wave-2 failures were the two runtime-dependency pins
  (fixed 8b80ec9). The D-05 typography test passes standalone and in the full suite after
  the fr.json NBSP fixes (export.title guillemets, export.notice.staticMode colon).
- The pre-existing server.js lint errors (TZ_BY_LABEL, empty block) recorded by the 54-02
  executor remain — out of phase scope, untouched.
  status: acknowledged

## OPEN UAT ENTRY — human Project/workbook check (54-05 Task 3, 2026-11-10)

Owner verdict received: **"skipped: no Project machine"** (2026-11-10). This is an explicit
skip, NOT a verification success. The mechanical suite stands as the automated verification
of record (27/27 mspdi + route + client; full suite 1340 pass / 0 fail; lint/format/build
green). The human check remains OPEN for the first Project-equipped machine:

Run `node test/make-export-samples.mjs`, then:

1. Open `test-results/export-samples/project-en.xml` in Microsoft Project, accept the import,
   and report:
   - whether a repair prompt appeared (if yes: record the exact dialog text + failing element, hand to planner — do NOT patch in-place);
   - number of tasks, and whether both milestones show;
   - whether the finish-to-start dependency arrow/link exists;
   - whether the five custom fields (Text1 key, Text2 status, Text3 priority, Text4 labels, Text5 estimate) are populated;
   - whether durations read in days and match the fixture estimates (3d, 90m, spans);
   - whether accented / non-Latin text survived.
2. Open `test-results/export-samples/project-en.xlsx` once in LibreOffice or Excel and confirm
   the six sheets, the three charts, the Gantt bars and at least one dependency arrow render.

Closes R8 acceptance on confirmation.
  status: acknowledged
