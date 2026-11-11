# Deferred Items (55)

## 55-08 execution (2026-11-11)

- **Pre-existing lint errors in unrelated files (out of scope, untouched):** `db-adapter.mjs` (no-undef process/console), `e2e/teams.spec.mjs`, `export/xlsx.js`, `mailer.js` (no-control-regex), `server.js:1647 TZ_BY_LABEL unused` + `server.js:1989 no-empty`, `test/assignees-migration.test.mjs`, `test/browser-push.test.mjs`. `npm run lint` fails on the full tree (55 errors) but the files this plan touched are lint-clean. Scope boundary: not fixed here.
- **Project-scoped accept grant is overwritable by a client doc PUT:** the p.members grant written by the accept path (revision-preserving) is a mirrored-profile convenience; the inviter's own PUT of a pre-accept doc legitimately replaces it (the membership row is the source of truth and repair happens on read). The regression test reads the grant BEFORE the inviter's write and documents this. If full persistence of the grant across concurrent client writes is ever required, that would need server-side merge protection (Rule 4 territory, not attempted here).
