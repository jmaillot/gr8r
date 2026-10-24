# Phase 10: Browser coverage in both locales - Research

**Researched:** 2026-10-24
**Domain:** Playwright Chromium coverage of eight untested UI flows, in English and French
**Confidence:** HIGH (in-repo evidence; one scope blocker found — see UAT-07)

## Summary

The suite is small and disciplined: three spec files (`tenancy` 6 tests, `locale` 4,
`french-overflow` 6) over one Chromium project, one throwaway server per run (`e2e/server.mjs`,
port 4317, `SEED_DATA=false`, `ALLOW_SIGNUP=true`), fixtures only through the real API
(`e2e/helpers/setup.mjs`), role/label/text selectors for every visibility claim. Phase 10 adds a
fourth spec family (`e2e/flows.spec.mjs`, D-01) that walks the eight unproven flows, each in
English and French, plus a config-level `locale: 'en-US'` pin (D-05, UAT-09) and a criterion-4
extension of `e2e/locale.spec.mjs` (D-04).

Everything the phase needs is already in place: the `createAccount` helper in `locale.spec.mjs`
(signup → workspace → `PATCH /api/auth/me { locale }`) is the D-06 promotion candidate; the
`LOGIN` selector-dictionary pattern (en/fr label sets in one object) is the French-variant
pattern; the toasts (`#toasts` host, `.toast[role=status]`, auto-dismiss ≈4.2 s) and the
`aria-label`/`data-tip` chrome are the assertion surfaces the roadmap names.

**One blocker found:** the **workspace plan change flow no longer exists**. Phase 7 deliberately
went billing-free (commit 45e3c42 removed the settings billing group and the plan-change flow;
the `/api/workspaces/:slug/plan` endpoint returns 404 and `test/membership.test.mjs` asserts that
404 for every role). UAT-07 as written ("changing the workspace plan is covered by a browser
test") cannot be satisfied by testing a UI that is gone. The planner must put this to the user —
the recommended reading is "the billing-free state is proven in a browser" (settings shows no
plan/billing group, the endpoint 404s), not a resurrection of removed UI. This is the only open
decision; the other seven flows all have live, catalogue-driven UI.

**Primary recommendation:** build `e2e/flows.spec.mjs` with one `test.describe` per flow and a
fr/en selector dictionary per flow; promote `createAccount` into `e2e/helpers/setup.mjs` (D-06);
pin `use: { locale: 'en-US' }` in `e2e/playwright.config.mjs` with the UAT-09 comment (D-05);
extend the criterion-4 test in `e2e/locale.spec.mjs` (D-04); and raise the UAT-07
reinterpretation to the user before planning that task.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The eight flows live in one new spec file, `e2e/flows.spec.mjs`, grouped into
  `test.describe` blocks per flow — matching the suite's one-file-per-proof-family shape
  (`tenancy`, `locale`, `french-overflow`), with shared fixtures in `test.beforeAll`.
- **D-02:** Language is an account property, switched through the UI on throwaway accounts
  (per-suite, `clientIp`-unique) — the phase-8 pattern. Playwright's browser-level
  `locale` config is NOT used to drive the app's localization logic.
- **D-03:** Each flow runs its full happy path and asserts at each step with the suite
  convention: role/label/text selectors for every visibility claim plus toasts for outcomes —
  the `aria-label` / `data-tip` / toast surfaces where leaks live (roadmap constraint).
- **D-04:** The missing criterion-4 assertions (reload + workspace switch + second browser
  context, per-account language) extend `e2e/locale.spec.mjs`, which already owns the
  alice(fr)/bob(en) shared-workspace fixtures. The second workspace for the switch is created
  via the API in the fixture step — not through the UI.
- **D-05:** The pin becomes explicit: `use: { locale: 'en-US' }` in `e2e/playwright.config.mjs`
  with a comment naming UAT-09.
- **D-06:** `e2e/helpers/setup.mjs` grows a shared locale-aware account/workspace creation
  helper (the `createAccount` pattern from `locale.spec.mjs` promoted into the helper file).
  Tenancy's bare fixtures stay untouched; every fixture still goes through the real API with
  explicit status checks.

### the agent's Discretion
None recorded — the context gathered the decisions it needed.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UAT-01 | Onboarding wizard covered by a browser test | 6-step wizard inventoried in `src/pages/auth.js` (selectors, inputs, finish toast) |
| UAT-02 | Invite modal covered | `modals.js` `case 'invite'` inventoried (input aria-label, submit, link/toast surfaces) |
| UAT-03 | `/join` page covered | three render variants in `pages/auth.js`; token route in `main.js` |
| UAT-04 | Project share modal covered | `shareModal()` in `modals.js` inventoried (add member, permission select, access select) |
| UAT-05 | Member removal covered | `A.removeMember` → `confirmDlg` → `toast('toast.removed')` chain inventoried |
| UAT-06 | Workspace switcher covered | `popovers.js` `case 'ws'` (`data-a="switchWs"`) inventoried |
| UAT-07 | Plan change covered | **BLOCKER**: flow was removed in phase 7 (billing-free); needs a user decision |
| UAT-08 | Project creation covered | `A.newProject` modal inventoried (existing probe precedent in french-overflow) |
| UAT-09 | Existing Chromium tests pinned to English | `use: { locale: 'en-US' }` config pin (D-05); negotiation path confirmed in `main.js` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Flow proofs (the eight flows) | Browser (Chromium via Playwright) | API tier (fixtures only) | Suite convention: visibility claims in the browser, `apiClient` creates fixtures |
| Locale assignment for fixture accounts | API tier | — | `PATCH /api/auth/me` before the browser opens (phase-8 contract, D-02) |
| Language negotiation pre-paint | Browser | — | browser `Accept-Language` drives primeLocale; account locale wins after `api.me()` |
| English pin (UAT-09) | Test config | — | `use: { locale: 'en-US' }` in `playwright.config.mjs` |
| Criterion-4 scenario | Browser (two contexts) | API tier (second workspace fixture) | Two accounts, one workspace, per-account language across reload/switch/second context |

## Standard Stack

No new packages. The phase uses what the suite already ships.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | installed (check `package.json` at plan time) [ASSUMED: exact version not read this session] | Chromium browser tests | the suite's only e2e framework |

### Supporting (in-repo, no install)
| Asset | Purpose |
|-------|---------|
| `e2e/helpers/setup.mjs` — `apiClient`, `clientIp(run, tag)`, `newRunId`, `PASSWORD` | fixture plumbing for every throwaway account/workspace [VERIFIED: e2e/helpers/setup.mjs:16-39, 45-79] |
| `locale.spec.mjs` `createAccount()` pattern | the D-06 helper to promote (signup → optional workspace → `PATCH /api/auth/me { locale }`, explicit status checks) [VERIFIED: e2e/locale.spec.mjs:22-36] |
| `LOGIN` selector dictionary (en/fr) | the French-variant selector pattern [VERIFIED: e2e/locale.spec.mjs:55-58] |

**Installation:** none (`npm run e2e` requires `npm run build` first — `e2e/server.mjs` hard-fails
without `dist/index.html` [VERIFIED: e2e/server.mjs:19-23]).

## Package Legitimacy Audit

No external packages are installed in this phase. Audit skipped — nothing to verify.

## Architecture Patterns

### System Architecture Diagram

```
npm run e2e
   │
   ▼
Playwright webServer ──► e2e/server.mjs ──► real server.js (127.0.0.1:4317,
   (gracefulShutdown)      mkdtemp DATA_DIR, SEED_DATA=false, ALLOW_SIGNUP=true)
                                   │
   test.beforeAll fixtures         │ fixtures only (apiClient, run-unique X-Forwarded-For)
   ├─ signup / login ─────────────►│
   ├─ POST /api/workspaces ───────►│
   ├─ invites + accept ───────────►│
   └─ PATCH /api/auth/me {locale} ►│  ← the phase-8 account-locale contract (D-02)
                                   │
   browser contexts (one per account, EN or FR) ──► the eight flows
        visibility claims: role/label/text selectors, aria-label, data-tip,
        toasts (#toasts → .toast[role=status])
```

### Recommended Project Structure
```
e2e/
├── playwright.config.mjs   # + use.locale 'en-US' pin with UAT-09 comment (D-05)
├── helpers/
│   └── setup.mjs           # + promoted createAccount helper (D-06)
├── flows.spec.mjs          # NEW — eight flow describes × en/fr (D-01)
├── locale.spec.mjs         # + criterion-4 extension (D-04)
├── french-overflow.spec.mjs  # unchanged
├── tenancy.spec.mjs        # unchanged (English-pinned via config)
└── server.mjs              # unchanged
```

### Pattern 1: Locale-aware account fixture (promote to helpers, D-06)
**What:** signup → (optional) workspace → `PATCH /api/auth/me { locale }`, all with explicit
status checks, on a run-unique `clientIp` so per-IP throttles never cross runs.
**When to use:** every fixture account in `flows.spec.mjs` and the locale extension.
**Example** (verbatim from `e2e/locale.spec.mjs:22-36` — this is the code being promoted):
```js
async function createAccount(tag, name, { locale, workspace } = {}) {
  const account = { email: `${tag}-${run}@e2e.local`, password: PASSWORD, name, ip: clientIp(run, tag), slug: workspace };
  const client = apiClient(BASE_URL, { name: tag, ip: account.ip });
  const signup = await client.post('/api/auth/signup', { name, email: account.email, password: account.password });
  if (signup.status !== 201) throw new Error(`${tag} signup failed with HTTP ${signup.status}: ${signup.data?.error || ''}`);
  if (workspace) {
    const ws = await client.post('/api/workspaces', { name: `Locale ${tag} ${run}`, slug: workspace });
    if (ws.status !== 201) throw new Error(`${tag} workspace failed with HTTP ${ws.status}: ${ws.data?.error || ''}`);
  }
  if (locale) {
    const patched = await client.patch('/api/auth/me', { locale });
    if (patched.status !== 200) throw new Error(`${tag} locale failed with HTTP ${patched.status}: ${patched.data?.error || ''}`);
  }
  return { account, client };
}
```

### Pattern 2: The per-flow selector dictionary (fr/en)
**What:** one object per flow carrying the en and fr label sets, exactly like `LOGIN` in
`locale.spec.mjs`. The English and French variants of a flow use the same describe structure and
the same steps, only the dictionary differs — a flow that fails fails identically in both
languages (CONTEXT § Specifics).
**Why:** the flows are selected by visible text; the catalogue is the only source of labels.

### Pattern 3: Toast assertion
**What:** toasts render into `#toasts` as `.toast` elements with `role="status"`, auto-kill at
**4 200 ms** (160 ms exit fade) [VERIFIED: src/ui/toast.js:8-27].
```js
await expect(page.getByRole('status').filter({ hasText: fr.expected }).first()).toBeVisible();
```
**Timing rule:** assert the toast promptly after the triggering click — do not insert waits
before the assertion; the 4.2 s lifetime is the budget.

### Pattern 4: Sign-in bootstrap
Reuse the suite's `signInPage`/`signIn` shape: goto `/`, `getByLabel` email/password, submit,
assert URL `/w/{slug}` [VERIFIED: e2e/locale.spec.mjs:64-70, e2e/french-overflow.spec.mjs:73-86].

### Flow-by-flow selector inventory (the planner's task material)

All labels are catalogue keys; English values quoted verbatim from `src/locales/en.json`,
French from `src/locales/fr.json` where read. Line numbers are verbatim-quote provenance.

**F1 — Onboarding wizard (UAT-01).** `src/pages/auth.js:129-207` (`renderOnboarding`), driven by
`S.ui.onb` (steps 0..5) with `data-a="onbNext" / onbBack / onbSet / onbExit / onbFinish`,
`data-in="onbWs / onbUrl / onbProj / onbInv"`. Reached automatically after signup when the
account has no workspace: `S.ui.auth = api.canCreateWorkspace ? 'onboarding' : 'no-workspace'`
[VERIFIED: src/main.js:194, src/actions/actions.js:2441]. Step contents:
- step 0: team-type radios — `role="radio"` options rendered by `opt()` (auth.js:136)
- step 1: workspace name input `#o-ws` (label `common.wsName`) + URL input `#o-url`
  (`common.wsUrl`, placeholder `gr8rstudio`)
- step 2/3: team-size buttons and project name `#o-proj` + template radios
- step 4: three invite inputs `#o-inv-0..2` with `aria-label` `a11y.auth.inviteEmail`
  ("Teammate's email") + `page.auth.sendInvites` submit
- final step: success card, `data-a="onbFinish"` → `page.auth.openWorkspace` ("Open workspace")
- step indicator: `aria-label="page.auth.stepOf {n}/{total}"` (auth.js:204-205)
Path: signup **in the browser** (or via API then browser signup form) → wizard → finish →
workspace URL. `ALLOW_SIGNUP=true` on the e2e server [VERIFIED: e2e/server.mjs:34].

**F2 — Invite modal (UAT-02).** `src/overlays/modals.js:212+` (`case 'invite'` → invite modal);
opened via the workspace popover (`data-a="invite"`, gated `isMemberAdmin()`,
popovers.js:259) or the create popover (popovers.js:130). Header
`modal.inviteTo {name}` ("Invite to {name}"). Input labelled `a11y.inviteByEmail`
("Invite by email"), placeholder `a11y.invitePlaceholder` ("Add people by name or email"),
submit `act.invite` ("Invite"). Success surfaces: toast `toast.inviteLinkCopied` ("Invite link
copied") / `toast.newInviteLinkCopied`; pending-invite rows carry
`aria-label="modal.inviteLinkFor {email}"` and a `data-a="copyText"` button
[VERIFIED: modals.js:225]. Hint text differs by `api.mailEnabled` (`modal.inviteMailHint` /
`modal.inviteLinkHint`) — on the e2e server SMTP is off, expect the link-hint branch.

**F3 — `/join` page (UAT-03).** Route extracted at `src/main.js:155`
(`/join/:token`, 16–128 chars); `S.ui.auth = 'join'` (main.js:173). Renderer
`src/pages/auth.js:54-77`, three variants:
- new visitor: form with `#j-name` (`common.fullName`), `#j-email` (readonly when the invite
  carries an address, hint `page.auth.inviteForAddress`), `#j-pw` + strength meter, submit
  `data-a="doJoin"` → `page.auth.createJoin`; heading `page.auth.joinTitle {name}`
- existing account: `page.auth.signInAndJoin` button (`data-a="auth" data-v="login"`)
- invalid/expired: `page.auth.inviteUnavailable` heading + `page.auth.goToSignIn`
Fixture: create the invite via API (`POST /api/workspaces/:slug/invites`, parse `/join/` token —
the `inviteToken()` helper exists in setup.mjs:87-92 but is NOT exported; either export it or
duplicate the slice). The browser then opens `/join/<token>`; the accept may also need the
run-unique IP on the new context (invite-accept throttle 5/hour/IP, setup.mjs header comment).

**F4 — Project share modal (UAT-04).** `src/overlays/modals.js:155-210` (`shareModal`).
Header `modal.shareTitle {name}`. Add-by-email row: input `#share-in`
(`aria-label` = `a11y.inviteByEmail`), permission `<select aria-label="modal.permission">`
(options via `permLabel(PERMS)`, default `'Can edit'`), submit `data-a="shareInvite"`
(label `act.invite`). Existing member rows: `select[aria-label="modal.permissionFor {name}"]`
with an `__remove` option labelled `act.removeAccess`. General access select
`select[data-in="shareAccess"]` (`aria-label` = `modal.generalAccess`) with options
`modal.onlyInvited` ("Only people invited") / `modal.everyoneAt {name}`.
Perms vocabulary check: `PERMS` values are machine ids labelled through the catalogue
(I18N-07 contract) — the test should select by rendered label, not by option value text.

**F5 — Member removal (UAT-05).** `A.removeMember` at `src/actions/actions.js:1838-1866`;
entry is the member row context menu (`data-a="removeMember"`,
`overlays/context-menu.js:74`, label `act.removeFromWorkspace`). It opens `confirmDlg`:
title `act.removeTitle {name}`, ok button `act.removeMember`, `danger: true`. Success toast:
`toast.removed {name}` [VERIFIED: actions.js:1855]. Confirmation dialog = the app's own modal
(`.modal-wrap .modal`), not `window.confirm` — no Playwright dialog handler needed
[french-overflow.spec.mjs already drives `.modal-wrap .modal` structurally].
**French pitfall:** the confirm body contains a raw English splice —
`` `${esc(m.name)} will lose access to ${esc(D().ws.name)} immediately.`` (actions.js:1844) —
one of the deferred raw-English splices (STATE: "four raw-English splices deferred to
deferred-items.md; need new en keys, forbidden while en.json is the oracle"). The French variant
must assert the **title** (`act.removeTitle`) and the **toast** (`toast.removed`), not the body
paragraph, or it will fail on a known, deliberately-deferred literal.

**F6 — Workspace switcher (UAT-06).** `src/overlays/popovers.js:259-268` (`case 'ws'`):
heading `popover.workspaces` ("Workspaces"), one `button[data-a="switchWs"][data-v=slug]` per
workspace showing its name + `roleLabel(w.role)`, a `check` icon marking the current slug, plus
`popover.createWorkspace` ("Create workspace"). Server mode only — demo mode renders no switcher
[VERIFIED: popovers.js:262-263 comment]. Switch outcome: navigates to `/w/{newSlug}`; assert the
URL and the new workspace's name rendered. Fixture: second workspace via API (D-04 pattern).

**F7 — Plan change (UAT-07) — ⚠ BLOCKED, needs a user decision.**
The plan-change flow was **deliberately removed** in phase 7:
- commit `45e3c42` "feat(07-02): client surfaces — the settings billing group, the plan-change
  flow, the permission column and the 54 catalogue keys are gone"
- the endpoint is gone: `test/membership.test.mjs:228-241` asserts `POST /api/workspaces/acme/plan`
  returns **404 for every role**
- no plan/billing UI or catalogue key remains in `src/` (grep for plan/billing/tier finds
  nothing outside `project.status.planning`)
There is no UI to drive. Options for the planner:
1. **Reinterpret UAT-07 as "the billing-free state is proven in a browser"** (recommended):
   a Chromium test asserts the settings page renders **no** plan/billing group and the workspace
   document carries no `plan` field (server deletes stale `data.plan`, server.js:591-592) — in
   both locales. Honest, matches the shipped product, requires user sign-off since it rewords
   the requirement's intent.
2. Restore a plan UI + endpoint — contradicts phase 7's shipped decision; almost certainly wrong.
3. Descope UAT-07 with an explicit amendment to REQUIREMENTS.md — cleanest paper trail if the
   user prefers, but leaves a requirement unproved.
This must be a `checkpoint:human-verify`-grade decision in the plan, not a planner guess.

**F8 — Project creation (UAT-08).** `A.newProject` (`src/actions/actions.js:1289`); modal at
`src/overlays/modals.js:116+` — header `act.newProject` ("New project") / `modal.projectHint`,
name field (label `modal.projectName` — verify exact key at plan time), submit
"Create project". Precedent already exists in `french-overflow.spec.mjs:127-130`:
`getByRole('button', { name: 'New project' }).first()` → `getByLabel('Project name')` →
`getByRole('button', { name: 'Create project' })` → visible result. The phase-10 test deepens it
(toast/label assertions, fr variant, project key derivation).

### Anti-Patterns to Avoid
- **Driving locale through Playwright's browser `locale`** for the flows: that only sets
  `Accept-Language` negotiation; the account locale wins after `api.me()`. D-02 is explicit —
  switch locale via `PATCH /api/auth/me` in fixtures (or the UI for switcher tests).
- **Structural selectors for visibility claims**: `.side`/`.topbar`/`.modal-f` are allowed only
  for box math (french-overflow convention); every product claim is role/label/text.
- **A fixture through the browser UI** when the API can create it — except where the UI *is* the
  proof (onboarding, switcher, project creation, `/join` accept).
- **Reusing an IP across accounts**: signup 5/hour/IP, invite-accept 5/hour/IP, login
  10/15 min/IP+email — every account gets its own `clientIp(run, tag)` [VERIFIED: setup.mjs:1-13].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale-aware fixtures | ad-hoc signup/PATCH code per spec | promoted `createAccount` helper (D-06) | one status-checked path, throttle-safe by construction |
| Invite-token extraction | URL parsing per spec | export `inviteToken()` from `setup.mjs` (or reuse the slice pattern) | single definition of the `/join/` marker |
| Sign-in bootstrap | new login helper | the `signInPage`/`signIn` shape both specs already use | asserts the landing URL, negotiates the right LOGIN dictionary |
| Flash/render-loop guards | new observers | reuse `recordPaints`/MutationObserver pattern only if a flow needs it | proven in locale/french-overflow |

**Key insight:** the suite's discipline (fixtures via API, assertions in the browser, run-unique
IPs, throwaway accounts) is what makes an 8×2 test matrix safe to run on one shared server —
don't invent a parallel mechanism.

## Runtime State Inventory

Omitted — this phase adds tests only; it renames and migrates nothing. (No stored data, service
config, OS registration, secret or build artifact carries anything this phase changes.)

## Common Pitfalls

### Pitfall 1: UAT-07 targets a flow that was removed
**What goes wrong:** a planned "plan change" browser test has no UI to click.
**Why:** phase 7 removed the billing surfaces on purpose; the endpoint 404s and a node:test
pins that.
**How to avoid:** resolve with the user before planning that task (options above).
**Warning signs:** a plan task that starts with "open Settings → billing" and has no such UI.

### Pitfall 2: French assertions on deliberately-raw English splices
**What goes wrong:** the member-removal confirm body (actions.js:1844) is still English in
French; a French test asserting it fails and looks like an i18n bug.
**Why:** the raw splices were deferred in phase 7 — new `en` keys were forbidden while
`en.json` is the oracle.
**How to avoid:** French (and English) assertions target catalogue-backed surfaces only: the
dialog title, the ok button, the toast. If the four deferred splices touch a flow under test,
surface it, don't fix it silently.
**Warning signs:** an assertion string that exists nowhere in en.json/fr.json.

### Pitfall 3: Toast lifetime (4.2 s) vs queued assertions
**What goes wrong:** a toast disappears before `expect` runs when earlier steps dally.
**How to avoid:** assert toasts immediately after the triggering action; prefer
`getByRole('status')` filtered by text over re-querying the host.

### Pitfall 4: Throttle exhaustion across a bigger matrix
**What goes wrong:** 8 flows × 2 locales × several accounts each = dozens of signups/logins in
one run; a shared IP fails with 429.
**How to avoid:** every account gets `clientIp(run, uniqueTag)`; the tag must be unique per
account, not per flow. The e2e server reads `x-forwarded-for` because production sits behind a
proxy (TRUST_PROXY is opt-in allow-list since phase 9 — the e2e wrapper sets what it needs).

### Pitfall 5: `locale: 'en-US'` pin interacts with account locale
**What goes wrong:** someone expects the pin to force English everywhere; a fixture account
patched to `fr` still boots French (LOC-03) — which is exactly what the French variants need.
**How to avoid:** the pin guarantees the *negotiated* language for accounts with NULL locale
(the tenancy fixtures); French flows come from the account patch, not the config. Comment this
in the config next to the pin (D-05).

### Pitfall 6: Onboarding start state
**What goes wrong:** navigating to `/` while signed out lands on login, not onboarding; the
wizard only appears for a signed-in account with no workspace (`api.canCreateWorkspace`).
**How to avoid:** the F1 test signs up **in the browser** so the post-signup route lands on the
wizard; an API-created account already owns a workspace and skips it.

## Code Examples

### The config pin (D-05)
```js
// e2e/playwright.config.mjs — inside use:
use: {
  baseURL: BASE_URL,
  locale: 'en-US', // UAT-09: the existing specs are pinned to English. Fixture accounts
                   // patched to 'fr' still boot French — the account locale wins over the
                   // negotiated one (LOC-03); this pin only fixes the negotiated default.
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'off',
},
```

### The flows spec shape (D-01, D-03)
```js
const INVITE = {
  en: { open: 'Invite members', heading: /Invite to /, input: 'Invite by email', submit: 'Invite',
        toast: 'Invite link copied' },
  fr: { open: 'Inviter des membres', heading: /Inviter dans /, input: 'Inviter par e-mail', submit: 'Inviter',
        toast: 'Lien d’invitation copié' },
};

test.describe('invite modal', () => {
  for (const [loc, L] of Object.entries(INVITE)) {
    test(`invite flow asserts labels and toast (${loc})`, async ({ browser }) => { /* ... */ });
  }
});
```
(French values shown are from the fr.json grep results above; the executor must re-read the
catalogue for the exact strings it asserts — values were not all read verbatim this session.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace plan UI + `/plan` endpoint | billing-free product; endpoint 404 pinned by node:test | Phase 7 (commit 45e3c42) | UAT-07 needs reinterpretation |
| Shared document `lang` preference | per-account `users.locale` via `PATCH /api/auth/me` | Phase 8 | fixtures set locale via API, not the workspace doc |
| Locale applied mid-boot | primeLocale before first paint, negotiated from the browser | Phase 8 | the config pin and account patch compose predictably |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | @playwright/test version is current and unchanged since phase 7 | Standard Stack | negligible — no install; planner reads package.json anyway |
| A2 | UAT-07's best reading is "billing-free state proven in a browser" | F7 / Pitfall 1 | planner plans a test the user considers off-intent — hence the explicit checkpoint |
| A3 | The deferred raw-English splices are limited to bodies the tests need not assert | Pitfall 2 | a French variant fails on a known-deferred literal; mitigation: assert catalogue-backed surfaces only |
| A4 | `permLabel` translates the PERMS values (I18N-07 contract) so option labels are localized | F4 | a share-modal test selecting by English label text fails in French — select by rendered catalogue label |
| A5 | French catalogue values quoted for toasts/labels (e.g. "Lien d’invitation copié") are accurate | Code Examples | an executor asserting a mis-quoted string fails once and re-reads the catalogue |
| A6 | The workspace-switcher popover trigger button's own label/aria-label (topbar/sidebar) | F6 | executor greps for the trigger at implementation time; trivial |

## Open Questions

1. **UAT-07 semantics (blocking)**
   - What we know: the plan-change UI and endpoint were removed in phase 7 and their absence is
     pinned by `test/membership.test.mjs`.
   - What's unclear: whether the user wants (1) the billing-free proof, (2) a restored flow, or
     (3) a requirements amendment.
   - Recommendation: option 1 with an explicit user checkpoint in the plan.

2. **`inviteToken()` export**
   - What we know: the helper exists in `setup.mjs` but is not exported.
   - Recommendation: export it in the D-06 helper task; no behavior change.

3. **Deferred raw-English splices overlap with the eight flows**
   - What we know: member-removal's confirm body is one of them; whether the other three touch
     these flows was not traced exhaustively.
   - Recommendation: the planner instructs the executor to assert catalogue-backed surfaces and
     to grep `deferred-items.md` if a French assertion cannot find its string.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 24 | server + Playwright | ✓ (project pins .nrc 24) | 24 | — |
| Playwright Chromium | all tests | ✓ (suite runs in CI today) | installed | — |
| Built `dist/` | `npm run e2e` | built by `npm run build` | — | hard error message tells you |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test, single `chromium` project |
| Config file | `e2e/playwright.config.mjs` |
| Quick run command | `npx playwright test e2e/flows.spec.mjs` (after `npm run build`) |
| Full suite command | `npm run build && npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UAT-01 | onboarding wizard happy path, EN+FR, label/toast asserted | e2e | `npx playwright test e2e/flows.spec.mjs` | ❌ Wave 0 (created by the phase itself) |
| UAT-02 | invite modal happy path + toast, EN+FR | e2e | same | ❌ Wave 0 |
| UAT-03 | `/join` accept in browser, EN+FR | e2e | same | ❌ Wave 0 |
| UAT-04 | share modal add-member + permission, EN+FR | e2e | same | ❌ Wave 0 |
| UAT-05 | member removal via confirm dialog + toast, EN+FR | e2e | same | ❌ Wave 0 |
| UAT-06 | switch between two workspaces, EN+FR | e2e | same | ❌ Wave 0 |
| UAT-07 | per the user decision (billing-free proof assumed) | e2e | same | ❌ Wave 0 |
| UAT-08 | project creation with assertions, EN+FR | e2e | same | ❌ Wave 0 |
| UAT-09 | config pin keeps existing specs English | e2e (config) | `npm run build && npm run e2e` | config edit |

### Sampling Rate
- **Per task commit:** the new spec file only (`npx playwright test e2e/flows.spec.mjs`)
- **Per wave merge:** `npm run build && npm run e2e` (whole suite — the pin must not disturb the
  six tenancy tests or the locale/french-overflow proofs)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- None beyond the spec file itself — framework, config, helpers and server wrapper all exist.
  (The D-06 helper promotion and D-05 config pin are wave-0-shaped tasks inside the phase.)

## Security Domain

This phase ships test code only — no new attack surface. Standing constraints it must respect:

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V5 Input Validation | no (no product code) | — |
| V2 Authentication | exercised, not changed | fixtures use the real signup/login API; throwaway accounts only |
| Rate-limit hygiene | yes (test correctness) | run-unique `X-Forwarded-For` per account (existing convention) |
| Data hygiene | yes | e2e server writes only to its `mkdtemp` DATA_DIR; no real database touched |

**Known threat patterns:** none new. The tests must not weaken the suite's guarantees: no
assertion may move from the browser into the API client (the "E2E assertions stay in the
browser" decision, STATE).

## Sources

### Primary (HIGH confidence)
- `e2e/playwright.config.mjs`, `e2e/server.mjs`, `e2e/helpers/setup.mjs` — read in full this session
- `e2e/locale.spec.mjs`, `e2e/french-overflow.spec.mjs` — read in full this session
- `src/pages/auth.js` (onboarding + join renderers), `src/overlays/modals.js` (share/invite),
  `src/overlays/popovers.js` (ws switcher), `src/actions/actions.js` (removeMember),
  `src/ui/toast.js` — read this session with line citations
- `test/membership.test.mjs:228-241` — the plan-endpoint 404 pin
- git commit `45e3c42` — the plan-flow removal
- `.planning/ROADMAP.md` Phase 10 section, `.planning/REQUIREMENTS.md`, `10-CONTEXT.md`

### Secondary (MEDIUM confidence)
- Catalogue values from targeted greps of `src/locales/en.json` / `fr.json` (not all read
  verbatim; the executor re-reads the catalogue for every asserted string)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Test infrastructure & patterns: HIGH — every file read this session
- Flow selector inventory: HIGH for structure/paths/actions, MEDIUM for exact French strings
- UAT-07 blocker: HIGH — removal pinned by both a commit and a passing test

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (in-repo evidence; stable)
