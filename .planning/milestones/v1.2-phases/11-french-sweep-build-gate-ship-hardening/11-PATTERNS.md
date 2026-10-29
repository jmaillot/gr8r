# Phase 11: French sweep, build gate & ship hardening - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 8 (4 new, 4 modified)
**Analogs found:** 8 / 8

All analog paths verified git-tracked (`git ls-files` non-empty).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `e2e/french-overflow.spec.mjs` (extend) | e2e spec | request-response (API fixtures) + browser DOM scan | itself (the file being extended) + `e2e/flows.spec.mjs` | exact |
| `test/i18n-scan.test.mjs` (extend) | test (node:test contract) | batch/transform | itself (the file being extended) | exact |
| `test/dependencies.test.mjs` (NEW) | test (node:test contract) | file-I/O (read package.json + Dockerfile) | `test/i18n-scan.test.mjs` | role-match |
| `.github/workflows/ci.yml` (extend) | config (CI) | event-driven (push/PR) | itself (existing 2-job shape) | exact |
| `e2e/demo-locale.spec.mjs` (NEW) | e2e spec | browser-only (no API fixtures) | `e2e/french-overflow.spec.mjs` | role-match |
| `e2e/demo.playwright.config.mjs` (NEW) | config (test runner) | — | `e2e/playwright.config.mjs` (the main config it parallels — separate-config strategy per 11-03, main config untouched) | role-match |
| `README.md` (extend) | docs | — | itself (existing section style) | exact |
| `CHANGELOG.md`, `DEPLOY.md` (extend) | docs | — | themselves | exact |

## Pattern Assignments

### `e2e/french-overflow.spec.mjs` — 21-route sweep extension (D-01..D-06)

**Analog:** the file itself (16-route scaffold) + `e2e/flows.spec.mjs` (catalogue-driven assertions, `fmt()`).

**Fixture / boot pattern** — the sweep should switch to the phase-10 locale-aware helper (D-06); the current `beforeAll` (lines 25–40) hand-rolls what `createAccount` now provides:

```js
// e2e/helpers/setup.mjs:125-136 — the helper to adopt
export async function createAccount(base, run, tag, name, { locale, workspace } = {}) {
  const account = { email: `${tag}-${run}@e2e.local`, password: PASSWORD, name, ip: clientIp(run, tag), slug: workspace };
  const client = apiClient(base, { name: tag, ip: account.ip });
  expectStatus(`${tag} signup`, await client.post('/api/auth/signup', { name, email: account.email, password: account.password }), [201]);
  if (workspace) {
    expectStatus(`${tag} workspace`, await client.post('/api/workspaces', { name: `Locale ${tag} ${run}`, slug: workspace }), [201]);
  }
  if (locale) {
    expectStatus(`${tag} locale`, await client.patch('/api/auth/me', { locale }), [200]);
  }
  return { account, client };
}
```

Sign-in still follows the file's own `signIn()` (lines 73–86): one context per account, `x-forwarded-for` header, `getByLabel` fills, URL regex assert.

**French-precondition pattern** — `frenchShell()` (lines 90–94) is the D-03 marker guard to generalize per route:

```js
async function frenchShell(page) {
  await expect(page.locator('.content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
}
```

**Route-list-as-data pattern** — the current pinned const (lines 48–65) becomes the 21-entry list (16 entries + the 5 phase-10 additions; planner fixes the canonical list per OQ-1). `page.goto('/w/${slug}/${route}')` + `frenchShell(page)` loop is lines 196–198.

**Catalogue-driven assertion pattern** (source of the English-value Set AND of per-route French markers — never hardcode transcriptions, 10-REVIEW WR-01):

```js
// e2e/flows.spec.mjs:24-43
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
const CATALOGUE = { en, fr };
function fmt(key, vars, lang) {
  let s = CATALOGUE[lang][key];
  if (s === undefined) throw new Error(`catalogue key missing in ${lang}: ${key}`);
  if (typeof s === 'object') { /* Intl.PluralRules selection */ }
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}
```

Note: `test/i18n-scan.test.mjs:20` uses the identical import form for `en` — both are sanctioned patterns.

**Whole-tree leak scan (D-05/D-02)** — authored per RESEARCH §Code Examples; the deliberate *opposite* of the file's own `chromeBoxes()` (lines 99–113), which filters hidden elements. The scan walks all text nodes + `[aria-label]`/`[data-tip]` attributes + `document.title` against a flattened `en.json` leaf-value Set minus a small commented stop-list. Research excerpt (lines 397–415 of RESEARCH.md) is the skeleton.

**Comment-block convention** — every spec opens with a `/* ===== PHASE N ... ===== */` banner (lines 1–12 here; flows.spec 1–23) explaining what the file owns and which decisions it proves. Copy this for the sweep section and the new demo spec.

---

### `test/i18n-scan.test.mjs` — pin tests (D-07/D-09)

**Analog:** the file itself. Key conventions to copy:

**Header + imports** (lines 1–22): banner comment, `node:test` + `node:assert/strict`, named imports from `../scripts/i18n-scan.mjs` including `main`, `import en from '../src/locales/en.json' with { type: 'json' }`.

**Live-tree exception precedent** (lines 4–9, 104–113): the file's charter is fixture trees, EXCEPT tripwires that must read the live tree. The two pin tests are exactly such live-tree exceptions:

```js
// The pin tests follow the live-tree exception charter (lines 4-9):
test('the i18n allow-list stays empty — an empty list is the proof the sweep is finished', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync('test/fixtures/i18n-pending.json', 'utf8')), []);
});
test('the scan exits 0 on the live tree', () => { assert.equal(main(), 0); });
```

**Note:** the suite already imports `execFileSync` (line 17) — if in-process `main()` misbehaves (assumption A4), the fallback is `execFileSync('node', ['scripts/i18n-scan.mjs'])` asserting exit 0, the same mechanism the machine-identifier guard-style tests use.

**Fixture-tree helper** (lines 25–33, `fixtureTree()`) — available if a negative probe (uncatalogued literal → non-zero) is wanted, though D-07 says the CI gate proof is the pin + existing `prebuild`.

---

### `test/dependencies.test.mjs` — NEW (D-12)

**Analog:** `test/i18n-scan.test.mjs` (contract-suite style) — but simpler: file-I/O only, no fixture tree.

```js
// Pattern: node:test + assert/strict + fs read of two files (i18n-scan.test.mjs:11-22, 110)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pkg from '../package.json' with { type: 'json' };   // JSON import form, per i18n-scan.test.mjs:20
// assert 1: !('dependencies' in pkg)
// assert 2: read Dockerfile text, runtime stage installs nothing beyond su-exec
//           and copies only server.js/mailer.js/seed.json/dist (Dockerfile:18-25)
```

**Dockerfile facts the assertion encodes** (read this session): runtime stage is `node:24-alpine` (line 12), `apk add --no-cache su-exec` is the only install (line 23), copies are exactly server.js/mailer.js/seed.json/dist (lines 18–21).

---

### `.github/workflows/ci.yml` — docker-build job (D-10)

**Analog:** the file itself. Current shape: `on: push/pull_request`, `permissions: contents: read`, two jobs each `runs-on: ubuntu-latest`, `actions/checkout@v7` + `actions/setup-node@v7` (lines 1–44). The new job is a **third sibling** following the same step conventions; it needs **no** setup-node (docker builds inside the image):

```yaml
  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker build -t projects:ci .
      - run: docker run -d --rm -p 8080:8080 -e ADMIN_EMAIL=ci@example.com -e ADMIN_PASSWORD='ci-password-1' projects:ci
      # wait for /api/health (the image's own HEALTHCHECK target, Dockerfile:33-34), then:
      # fetch / → resolve the fr-*.js asset name dynamically from the served page/assets
      # (NEVER hardcode the content hash) → fetch the chunk → assert French content
```

**Dockerfile facts to assert against:** build stage runs `npm run build` inside the image (line 9, so the fr chunk is built *in* the image); runtime copies `dist/` wholesale (line 21); `/api/health` is the health target (line 34). Entrypoint needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` verified during planning (assumption A3).

---

### `e2e/demo-locale.spec.mjs` (NEW) + `e2e/demo.playwright.config.mjs` (NEW) — D-11

**Analog spec:** `e2e/french-overflow.spec.mjs` — banner comment, `test/expect` import, role/label selectors, fresh context per scenario. **Analog config:** `e2e/playwright.config.mjs` — the new demo config parallels it as a SEPARATE file (the chosen strategy per 11-03): the main config stays untouched, and `demo.playwright.config.mjs` reuses its `webServer`/`gracefulShutdown` shape with `vite preview` (serves `dist/` only, no `/api` proxy — `vite.config.js` proxies only in dev `server` mode, so `/api` 404s and the demo fallback fires). The `locale: 'en-US'` pin (lines 18–23) stays in the main config — the demo test overrides per-context.

**Per-context locale override pattern** (flows.spec 65–70):

```js
const context = await browser.newContext({ baseURL, locale: 'fr-FR' }); // anonymous demo surfaces negotiate from the browser
```

**Persistence assertion target:** `src/core/i18n.js:112/120` — `localStorage.setItem(LOCALE_STORAGE_KEY, code)` / `getItem` at boot; switch EN↔FR via the phase-8 selector, reload, assert persisted locale.

---

### Docs — `README.md`, `CHANGELOG.md`, `DEPLOY.md` (D-13/D-14/D-15)

**Analog:** the files themselves; no code pattern. Conventions: README gains `## Internationalization` matching existing `##` section style; CHANGELOG keeps-achangelog style with 1.2.0 notes text only (no version bump, no `chore(release)` commit — D-14); DEPLOY mentions the new `docker-build` job and that the image carries the French catalogue.

## Shared Patterns

### Fixtures only through the real API; run-unique IPs
**Source:** `e2e/helpers/setup.mjs:1-13, 31-39, 125-136`
**Apply to:** `french-overflow.spec.mjs` sweep section. `createAccount(base, run, tag, name, { locale: 'fr', workspace })`; seed one project + one task via API (phase-7 spec lines 125–140 show the browser-fixture path for the UI, but sweep fixtures should go through the client).

### Catalogue-backed assertions — never hardcode transcriptions
**Source:** `e2e/flows.spec.mjs:24-60` (`fmt()`), `test/i18n-scan.test.mjs:20` (JSON import form)
**Apply to:** sweep English-value source AND French markers; demo spec assertions.

### One context per account / per scenario
**Source:** `e2e/french-overflow.spec.mjs:73-86`
**Apply to:** all new browser tests (also isolates localStorage in the demo test — Pitfall 4).

### node:test contract style
**Source:** `test/i18n-scan.test.mjs:1-33`
**Apply to:** `test/dependencies.test.mjs` and the pin tests: banner comment, `node:assert/strict`, descriptive test names stating the property, live-tree exception charter where applicable.

### CI step conventions
**Source:** `.github/workflows/ci.yml:12-44`
**Apply to:** docker-build job — same checkout action/version, `runs-on: ubuntu-latest`, no timeout needed unless e2e-like (e2e uses 20m).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | none; every file has an in-repo analog |

## Metadata

**Analog search scope:** `e2e/`, `test/`, `scripts/`, `.github/workflows/`, root (Dockerfile, package.json, docs)
**Files scanned:** 8 analogs read (french-overflow, setup.mjs, ci.yml, Dockerfile, i18n-scan.test.mjs head, playwright.config.mjs, flows.spec.mjs head, package.json scripts block)
**Pattern extraction date:** 2026-10-24
