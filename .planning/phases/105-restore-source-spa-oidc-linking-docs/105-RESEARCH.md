# Phase 105: Restore-Source SPA + OIDC Linking Docs — Research

**Researched:** 2026-11-28
**Domain:** Projects Studio hand-rolled Vite SPA (src/) restore drawer + zero-dep docs (DEPLOY.md / .env.example)
**Confidence:** HIGH (every anchor read from source this session; server-side surface verified live from Phase 104 artifacts + server.js)

## Summary

Two independent halves, zero new packages, zero new server routes.

**RSRC-04 (SPA):** The "restore dialog" is the **preview drawer** — `restorePreviewDrawer` (src/pages/backup.js:701-709) rendering `restorePreviewBody` (:620-699) — driven by state slots `S.ui.restorePreview` / `S.ui.restorePreviewData` and the actions block in src/actions/actions.js:5812-6017. The source picker slots into `restorePreviewBody` alongside the existing target/project chip pickers (chip idiom, :656-681), BEFORE the snapshot tip and CTAs. The picker's data feed is the tricky part: `sources[]` exists **only** on `GET /api/backup/restore/backups` (server.js:10423 route, payload field at server.js:10461), exposed client-side as `api.restoreBackups()` (src/core/api.js:572) — which currently has **zero client callers** (the standalone restore list was retired UAT round-9; the method survives for tests). The preview payload deliberately does NOT carry `sources[]` (GD-8 ruling, confirmed absent from the preview route at server.js:10986+). So the plan is: when the drawer opens (`A.restorePreview`, actions.js:5812), also kick `api.restoreBackups()` once and stage a `runId → sources[]` lookup in a new `S.ui` slot; the picker renders from that lookup. Zero probes on page load holds: the backups list GET does only `fs.existsSync` local checks (D-89-14, pinned by the 12-call-site seam test) — no network probes anywhere in the render path.

The probe UI hits `POST /api/backup/restore/probe` (server.js:9952, live-verified) — s3/ftp/smb only (a `local` request is a keyed 400 `restoreSourceInvalid`, so the UI renders NO probe affordance for local). Existing probe-result UI precedent is toast-based on save responses (actions.js:5448-5494, `toast.s3Probe*`/`ftpProbe*`/`smbProbe*` keyed families) — but a standalone probe call needs **pending + badge state**, which does not exist yet: a new `S.ui.restoreProbe` map keyed by `runId|source` holds `pending/ok/fail` and renders an inline badge beside each source chip, with the detailed probe key toasted reusing the existing `toast.*Probe*` vocabulary.

The chosen source rides: `?source=` query on preview + download (GETs), `body.source` camelCase on verify-checksum + the 3 trigger POSTs (GD-4 transport ruling, all routes live server-side). No mid-run source swap: source is a pre-run decision; once a trigger is accepted the drawer closes into the pending panel (existing flow) and the picker state resets.

**OIDCDOC-01..03 (docs):** server.js:6673-6715 re-read verbatim this session (fidelity source for every docs claim — see §Trust-Tenant-Email Fidelity). The DEPLOY.md rewrite zone is **lines 330-339** (Linking policy paragraph :330-334, Operator note :336-339), bounded above by the "After restarting…" smoke line (:328-329) and below by `**Smoke-test checklist**` (:341). OIDCDOC-02's group-claim prerequisites **already partially exist** under `#### Entra group mapping` (:365) → `**ApplicationGroup claim prerequisites**` (:373-392): the manifest edit (:376-379), the Enterprise-App assignment (:379 parenthetical) and the GUID-matching note (:380-381) are all present — the actual delta is the **explicit "where to copy the group Object-ID GUID" click-path** (Entra admin center → Groups → your group → Overview → copy Object ID) feeding the MAPUI-02 paste form, plus stating assigned-groups-only semantics where missing. `.env.example` lines 173-177 already carry a why + guest note; OIDCDOC-03 expands it with the literal-claim guest carve-out wording and a DEPLOY.md pointer.

**Primary recommendation:** Picker = chip row in `restorePreviewBody` fed by a drawer-open `restoreBackups()` kick into `S.ui.restoreSourcesById`; per-source probe button (s3/ftp/smb only) with pending/ok/fail badge in `S.ui.restoreProbe` and detail toast reusing `toast.*Probe*` keys; `source` threads through all 6 restore calls per GD-4; docs rewrite DEPLOY.md:330-339 + extend :373-392 with the GUID copy path; expand `.env.example:173-177`; update the i18n verb-count pin (84 → 85) and add ×5 `page.restore.source*` keys.

<user_constraints>
## User Constraints (from REQUIREMENTS.md / ROADMAP — no 105-CONTEXT.md exists)

- **RSRC-04** [VERIFIED: .planning/REQUIREMENTS.md:36]: picker fed by `sources[]` restricted to enabled destinations (dormant-slot contract); on-demand availability check UI (per-source or check-all — UX decided at discuss-phase, not researched here as locked); honest verification result (badge/toast); source switching mid-run NOT offered (new runId semantics).
- **OIDCDOC-01** [VERIFIED: .planning/REQUIREMENTS.md:40]: DEPLOY.md Linking-policy rewrite leads with `OIDC_TRUST_TENANT_EMAIL=true` for Azure AD work/school tenants; guest carve-out (acct=1 / external idp requires literal claim) pinned; symptom→cause table replaces the "check tenant email verification" note; verified against server.js:6673-6715, not memory.
- **OIDCDOC-02** [VERIFIED: .planning/REQUIREMENTS.md:41]: Azure setup steps gain `groupMembershipClaims: "ApplicationGroup"` manifest edit + Enterprise-Application group assignment + where to copy the group Object-ID GUID (feeds MAPUI-02 paste form).
- **OIDCDOC-03** [VERIFIED: .planning/REQUIREMENTS.md:42]: .env.example comment states the why + guest carve-out + DEPLOY.md pointer.
- **Roadmap SC ×5** [VERIFIED: .planning/ROADMAP.md:107-111]: picker + on-demand UI + honest result + no mid-run swap; zero probes on page load; DEPLOY.md leads with the flag + carve-out + symptom table; Azure steps (manifest + assignment + GUID location); .env.example why + carve-out + pointer.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSRC-04 | Restore dialog source picker + on-demand availability UI + honest result + no mid-run swap | §Restore Dialog Anatomy, §Picker Integration Recipe, §Probe UI Spec, §Source Transport, §i18n Inventory |
| OIDCDOC-01 | DEPLOY.md Linking-policy rewrite + symptom→cause table | §Trust-Tenant-Email Fidelity, §DEPLOY.md Boundaries |
| OIDCDOC-02 | Azure group-claim setup steps + GUID copy path | §DEPLOY.md Boundaries (§OIDCDOC-02 delta) |
| OIDCDOC-03 | .env.example comment expansion | §.env.example Section |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Picker rendering + source state | Client (src/pages/backup.js) | actions.js state | chips render from payload-derived `sources[]`; client never derives authority (D-23) |
| sources[] feed | API (server.js:10461, exists) | api.restoreBackups() | already shipped Phase 104; SPA only consumes |
| Availability probe | API (server.js:9952, exists) | actions.js + api.js client half | Phase 104 route is live; SPA adds `restoreProbe` method + UI |
| Source transport on 6 calls | Client api.js/actions.js | server routes (exist) | GD-4 mapping query-vs-body; server already validates |
| Docs rewrite | docs/DEPLOY.md + .env.example | — | static docs; fidelity pinned to server.js:6673-6715 |

## Standard Stack

**No new packages.** Zero-dependency posture; all facilities in-repo:

| Facility | Location | Purpose |
|----------|----------|---------|
| `restorePreviewDrawer` / `restorePreviewBody` | src/pages/backup.js:701-709 / :620-699 | the restore dialog; picker slot |
| Chip-picker idiom | src/pages/backup.js:656-681 (targetPicker), :673-681 (projectPicker) | the exact CSS/attribute pattern to copy |
| `S.ui.restorePreview` / `restorePreviewData` | actions.js:5815-5816 | drawer state machine |
| `api.restoreBackups()` | src/core/api.js:572-573 | the ONLY `sources[]` feed (zero current callers) |
| `api.restorePreview / restoreRun / restoreOverwrite / restoreInstance / backupVerifyChecksum` | api.js:575-577, :604-617, :530-531 | the calls that gain `source` |
| `A.backupDownload` raw-fetch download | actions.js:5652-5665 | GET download with hand-built query — gains `&source=` |
| Probe route (live) | server.js:9952+ | POST /api/backup/restore/probe, `restoreprobe\|<uid>` throttle 10/15min, RESTORE_USE∥BACKUP_MANAGE, s3/ftp/smb only |
| Probe-result toast vocabulary | actions.js:5448-5494 + `toast.s3Probe*`/`ftpProbe*`/`smbProbe*` keys | reuse for probe-detail toast |
| `restoreToast` / `restoreMissingToast` | actions.js:5103-5137 | err.* toast helper — `err.restoreSource*` toasts ride it |
| Mirror-flag badges | src/pages/backup.js:219-246 + `RESTORE_LOCATION_KEYS` :588 | existing per-row mirror badges (visual language for the picker) |
| `page.restore.*` locale region | src/locales/en.json:2315-2409 | new key landing zone, ×5 locales |
| Static client test pattern | test/restore-client.test.mjs:1-60 | fs-read source assertions; extend for Phase 105 |
| i18n verb-count pin | test/i18n-core-features.test.mjs:171 | **84 → 85 for `restoreProbe`** — must be updated with an inline comment |

## Restore Dialog Anatomy (current state machine)

**Entry:** a history row's Restore button (`data-a="restorePreview"`, backup.js:256) → `A.restorePreview` (actions.js:5812):

1. `S.ui.restorePreview = { runId }`; `S.ui.restorePreviewData = null`; render → drawer opens in loading state (`page.restore.listLoading`).
2. Fetches preview (`api.restorePreview(runId)`, GET with `?runId=`). Refusal → drawer closes + `restoreMissingToast` (err.* keyed).
3. On ok: `S.ui.restorePreviewData = { data: res.data }`; render → `restorePreviewBody` draws: detail grid (:682-687) → tables line → skipped note → flagged badges → **`picker`** (workspace target, project archives only) → **`projectPicker`** → `snapshotTipLine()` → CTAs (`ctas`, :631-643).
4. CTAs: `restoreNew` (single click, no confirm; actions.js:5883), `restoreOverwrite` (confirmDlg with typed-name gate; :5927 — two branches: project :5936-5964 / workspace :5966-5990), `restoreInstance` (DR phrase; :5995).
5. Accepted trigger → `S.ui.restorePreview/restorePreviewData/restoreTarget/restoreTargetProject = null`, `S.ui.restorePending = true`, `backupStartPolling()` → the drawer unmounts and `restoreProgress` panel (backup.js:715-734) takes over. Mid-run the picker does not exist → "no mid-run swap" is structurally true once the trigger resets state; a NEW run from a different source = re-open the drawer on the (new) runId.

**Close:** `A.restorePreviewClose` (actions.js:5844) nulls preview + previewData + backupScopes. **The picker state slots must be nulled here too** (and on accepted triggers) so a reopened drawer never shows stale probe badges.

## Picker Integration Recipe

### Data feed — the one real decision

`sources[]` rides ONLY `GET /api/backup/restore/backups` [VERIFIED: server.js:10423 route → payload `sources:` at server.js:10461, derivation verbatim:

```js
sources: [
  ...(r.filename && fs.existsSync(path.join(backupsRoot(), r.filename)) ? ['local'] : []),
  ...(r.uploaded === 1 && S3.enabled ? ['s3'] : []),
  ...(r.ftp_uploaded === 1 && FTP.enabled ? ['ftp'] : []),
  ...(r.smb_uploaded === 1 && SMB.enabled ? ['smb'] : []),
],
```

] — ordered local>s3>ftp>smb, enabled-only (dormant-slot contract). The client method exists (`api.restoreBackups()`, api.js:572) **but has no production caller** [VERIFIED: grep src/actions, src/pages, src/core → none; only test/restore-client.test.mjs:32 pins its existence]. The restore/history rows the drawer opens from are `restore_runs` rows (server.js:10966-10986 — no mirror flags) and the preview payload has no `sources[]` (GD-8, confirmed).

**Recipe (recommended):**

```js
// actions.js — inside A.restorePreview, after S.ui.restorePreview = { runId }:
if (!S.ui.restoreSourcesById) {
  api.restoreBackups().then(res => {
    if (res.ok) S.ui.restoreSourcesById = Object.fromEntries(
      (Array.isArray(res.data?.runs) ? res.data.runs : []).map(r => [r.runId, Array.isArray(r.sources) ? r.sources : []])
    );
    render();
  }).catch(() => {});
}
```

- Fail-open: if the backups list is unavailable, the drawer renders WITHOUT the picker (existing behavior preserved) — the server default ladder (registry order) still runs. The picker is ergonomics, never authority.
- Zero probes on load: `restoreBackups` does zero network probes (D-89-14 pinned by test). Page-load render path unchanged.

### Picker markup (slot: inside `restorePreviewBody`, between the flagged-badges block and `${picker}`)

Copy the chip idiom of the target picker verbatim (backup.js:656-663):

```js
// pages/backup.js — new sourcePicker block
const sources = S.ui.restoreSourcesById?.[String(d.runId)] || [];
const sourcePicker = sources.length > 1
  ? `<div style="margin-top:12px"><div class="label" style="margin-bottom:4px">${t('page.restore.sourcePickLabel')}</div>
     <div class="hint" style="margin:0 0 8px">${t('page.restore.sourcePickHint')}</div>
     <div class="row" style="gap:6px;flex-wrap:wrap">${sources.map(s => {
        const probe = S.ui.restoreProbe?.[`${d.runId}|${s}`];
        const probeUi = s !== 'local'
          ? `<button class="ibtn ibtn-sm" data-a="restoreProbe" data-id="${esc(d.runId)}" data-source="${esc(s)}"
               aria-label="${t('page.restore.sourceProbeCheck')}">${probe?.pending
               ? `<span aria-busy="true">${t('page.restore.sourceProbeChecking')}</span>`
               : ic('activity', 13)}</button>`
          : '';
        const badge = probe?.result
          ? `<span class="badge ${probe.result.ok ? 'green' : ''}" title="${esc(String(probe.result.key || ''))}">${probe.result.ok ? t('page.restore.sourceProbeOk') : t('page.restore.sourceProbeFail')}</span>`
          : '';
        return `<span class="row" style="gap:4px;align-items:center">
           <button class="btn btn-sm${(S.ui.restoreSource || sources[0]) === s ? ' btn-primary' : ''}"
             data-a="restoreSourcePick" data-source="${esc(s)}">${t(RESTORE_LOCATION_KEYS[s])}</button>${probeUi}${badge}
         </span>`;
      }).join('')}</div></div>`
  : '';
```

- **Default arm:** `S.ui.restoreSource || sources[0]` — first entry (local-first) is the implicit default; omitting `source` on the trigger keeps server registry order, so default = no param sent is ALSO honest. Recommended: only include `source` in the body/query when the operator explicitly armed a non-default source (`S.ui.restoreSource && S.ui.restoreSource !== sources[0]`).
- Single-source archives (`sources.length <= 1`) render NO picker — no dead chrome.
- `RESTORE_LOCATION_KEYS` (backup.js:588) already carries the local/s3/ftp/smb labels — reuse for chip text, no duplicate vocabulary.

### New actions (actions.js, restore block :5800-6017)

```js
A.restoreSourcePick = el => { S.ui.restoreSource = el.dataset.source || null; render(); };

A.restoreProbe = async el => {
  const runId = el.dataset.id, source = el.dataset.source;
  if (!runId || !source || source === 'local') return;         // server refuses local; never send it
  const key = `${runId}|${source}`;
  S.ui.restoreProbe = S.ui.restoreProbe || {};
  S.ui.restoreProbe[key] = { pending: true };
  render();
  const res = await api.restoreProbe({ runId, source });
  const probe = res.ok ? { ok: res.data?.key === 'success', key: res.data?.key, data: res.data } : { ok: false, key: res.data?.code };
  S.ui.restoreProbe[key] = { pending: false, result: probe };
  render();
  /* detail toast — reuse the existing probe-key families (actions.js:5448-5494 idiom) */
};
```

### Probe UI Spec

| Aspect | Spec |
|--------|------|
| Affordance | small icon button (probe glyph) beside each s3/ftp/smb chip; **no probe control for `local`** (server: `local` → 400 restoreSourceInvalid, VERIFIED server.js:9952+ source-allow-list) |
| Pending | `aria-busy` label `page.restore.sourceProbeChecking`; button disabled while pending |
| Result badge | inline `<span class="badge">` — green `page.restore.sourceProbeOk` when `result.key === 'success'`; neutral/red `page.restore.sourceProbeFail` otherwise, with the raw probe key in `title` (honesty: the class is visible, not hidden) |
| Detail toast | map the probe result key through the existing families: s3 → `toast.s3ProbeSuccess`/`toast.s3ProbeUnreachable` + `err.s3ClockSkew`/`s3NoBucket` etc.; ftp → `toast.ftpProbe*` + `err.ftp*`; smb → `toast.smbProbe*` + `err.smb*` (all ×5 already). Copy the mapping idiom at actions.js:5448-5494. `httpWarning` → `toast.s3ProbeHttpWarning` / `insecureTlsWarning`; smb `guest` flag → note in title/tooltip |
| Refusals | 429 `tooManyAttempts`, 400 `restoreSourceInvalid`/`restoreSourceNotMirrored`, 403 `backupRoleRequired`, 404 `restoreArchiveMissing` → `restoreMissingToast(res.data?.code)` (err.restoreSource* keys exist ×5: en.json:1807-1808) |
| State reset | `S.ui.restoreProbe` entries cleared in `A.restorePreviewClose`, accepted-trigger paths (restoreNew/Overwrite/Instance), and when the drawer opens on a different runId |
| Budget | `restoreprobe\|<uid>` 10 per 15 min (VERIFIED server.js:9955) — per-source on-demand clicks fit comfortably; no check-all loop recommended (2 sources × N runs would drain the shared operator budget; per-source = owner intent) |

### Source Transport (GD-4, all server routes live — client half to add)

| Call | Client site | Transport | Change |
|------|-------------|-----------|--------|
| preview | `api.restorePreview(runId)` api.js:575 | `?source=` query | add optional `{ source }` opts → append `&source=${encodeURIComponent(source)}` when armed |
| download | `A.backupDownload` raw fetch actions.js:5652-5655 | `?runId=` query | append `&source=…` when armed (download is drawer-external; scope decision: arm only while drawer open — simplest is to NOT thread source into download unless owner wants it; RSRC-04 names restore calls, download is optional) |
| verify | `api.backupVerifyChecksum(runId)` api.js:530 | body `{ runId }` | body gains `source` (camelCase) when armed |
| trigger import-new | `api.restoreRun({ runId, targetWorkspaceId })` actions.js:5892 | body | body gains `source` |
| trigger overwrite | `api.restoreOverwrite({ runId, targetId, … })` actions.js:5950/:5976 | body | body gains `source` (both branches) |
| trigger instance | `api.restoreInstance({ runId, confirmPhrase })` actions.js:6005 | body | body gains `source` |

Client-side arming guard (mirror, never authority): only send `source` values that came from `sources[]` — an armed-but-not-offered value is refused keyed by the server anyway (`restoreSourceNotMirrored`).

### Honest verification result display

- Probe: the badge IS the honest result (ok/fail + raw key tooltip); a failed probe never mutates flags and never disables the chip (flag is truth — R-4).
- Restore completion: `page.restore.runDone` already states "Verified against the manifest" (en.json:2338) — the run-level honesty is pre-existing (D-89 render-verbatim). The new honest surface is probe + the runDone toast; no new run-stage vocabulary.

## i18n Inventory (×5 locales, same commit)

Landing zone: `page.restore.*` beside en.json:2315-2409 family. Existing reusable keys: `RESTORE_LOCATION_KEYS` labels (`locLocal/locS3/locFtp/locSmb`, en.json:2317-2320), `err.restoreSourceInvalid` / `err.restoreSourceNotMirrored` (en.json:1807-1808, live since 104), probe-detail `toast.*Probe*` families (pre-existing).

**New keys (recommended set — 5):**

| Key | Suggested en text | Used by |
|-----|-------------------|---------|
| `page.restore.sourcePickLabel` | "Restore from" | picker label |
| `page.restore.sourcePickHint` | "Pick where the archive is fetched from. Default is the first available." | picker hint |
| `page.restore.sourceProbeCheck` | "Check availability" | probe button aria-label |
| `page.restore.sourceProbeChecking` | "Checking…" | pending state |
| `page.restore.sourceProbeOk` / `page.restore.sourceProbeFail` | "Available" / "Unreachable" | result badge (planner may split or collapse) |

- ×5 = en/de/es/fr/nl (5 files, VERIFIED ls src/locales/). Every key lands in all five in the SAME commit (house rule; restore-client.test.mjs asserts 5-locale key parity).
- The i18n verb-count pin at test/i18n-core-features.test.mjs:171 (`verbs.length, 84`) increments to **85** for the new `api.restoreProbe` GET/POST method — the pin's comment chain documents each `+1`; add the Phase-105 entry.

## DEPLOY.md Boundaries (line-verified 2026-11-28)

| Boundary | Line | Content today |
|----------|------|---------------|
| Preceding | :328-329 | "After restarting the container, run one real sign-in… smoke test" paragraph — keep |
| **OIDCDOC-01 rewrite zone** | **:330-334** | `**Linking policy — verified email required**:` paragraph (claim gate, fail-closed, already-linked immunity) |
| **OIDCDOC-01 rewrite zone** | **:336-339** | `**Operator note**:` paragraph — the WRONG "check tenant email verification" advice; replaced by the OIDC_TRUST_TENANT_EMAIL lead + guest carve-out + symptom→cause table |
| Following (keep) | :341 | `**Smoke-test checklist** (from an empty config…)` heading |

**Replacement structure (recommended):** (1) Linking-policy paragraph updated to state the literal-claim rule AND the `OIDC_TRUST_TENANT_EMAIL` substitution for pinned-tenant members — leading with the flag for Entra; (2) guest carve-out sentence (guests = `acct=1` or external `idp` → flag does NOT apply, literal `email_verified: true` required); (3) symptom→cause markdown table replacing the Operator note: `Sign-in with Microsoft failed (generic error)` → `Azure AD work/school token omits email_verified` → `set OIDC_TRUST_TENANT_EMAIL=true (pinned tenant, non-guest)` → second row: guest sign-in fails → literal claim required → fix at IdP; third row: still failing → issuer/tenant pinning. Anchor conventions: DEPLOY.md uses `####`/`**bold lead-ins**`, no TOC/anchors — no heading changes needed.

**OIDCDOC-02 delta (do NOT duplicate — extend):** the group-claim prerequisites already exist under `#### Entra group mapping` (:365) → `**ApplicationGroup claim prerequisites**` (:373-392): manifest `groupMembershipClaims: "ApplicationGroup"` (:376-379 ✓), Enterprise-App assignment (:379 parenthetical ✓), GUID-matching note (:380-381 ✓). **Missing piece:** the explicit copy-path for the group Object-ID GUID — add a step: "Entra admin center → Identity → Groups → your group → Overview → copy **Object ID** — that GUID is the value pasted into the /governance mappings form." [VERIFIED: grep "Object-ID" docs/DEPLOY.md → :380 only, no copy-path]. Planner decision: extend the :373-392 bullet list rather than add a new section (anchors/TOC conventions make a new heading optional).

## .env.example Section

Current lines **173-177** [VERIFIED, verbatim]:

```dotenv
# true = a pinned-tenant member's email is trusted without the Azure AD
# `email_verified` claim (work/school tokens omit it). Guests still require
# literal email_verified. Leave false unless SSO logins fail with the generic
# "Sign-in with Microsoft failed" error for real tenant users.
OIDC_TRUST_TENANT_EMAIL=false
```

**OIDCDOC-03 delta:** the why and a guest note already exist; expand to (a) state the guest carve-out mechanics explicitly (`acct=1` / external `idp` identities always need the literal claim — the flag never applies to them), and (b) add the pointer: "See docs/DEPLOY.md → Linking policy for the full decision table." Keep the strict-token list implicit or state `true/1/yes/on` (server.js:6722 parses exactly those four; PITFALLS.md:132 recommends the comment carry it so it cannot drift).

## Trust-Tenant-Email Fidelity (server.js:6673-6715 re-read verbatim this session)

For docs accuracy, the exact semantics [VERIFIED: server.js:6673-6727]:

- `isPinnedTenant = claims.tid === OIDC.config.tenantId` (:6689).
- `guestShape = (typeof claims.idp === 'string' && claims.idp !== '' && claims.idp !== OIDC.config.issuer) || String(claims.acct ?? '') === '1'` (:6690).
- `canLink = isPinnedTenant && !guestShape` (:6691).
- `trustTenantEmail = ['true','1','yes','on'].includes(String(process.env.OIDC_TRUST_TENANT_EMAIL ?? '').trim().toLowerCase())` (:6722).
- `verifiedEmail = claims.email_verified === true || (trustTenantEmail && isPinnedTenant && !guestShape)` (:6723) — the substitution covers BOTH linking and JIT provisioning, but guests/external-idp identities always need the literal claim.
- Already-linked `(issuer, subject)` rows resolve without re-checking (immunity, established identity).
- Fail-closed surface: generic `/login?sso=error` — the doc symptom is exactly that generic error.

## Test Plan (patterns named by file)

| Test | File | Pattern |
|------|------|---------|
| api method pins (restoreProbe, source params on 6 methods) + no client-side derivation + doc-block refusal vocabulary | test/restore-client.test.mjs | fs-read source assertions (`assert.match(apiSrc, …)`); extend the five-method list to six; assert `restoreprobe` route string, `?source=` on preview GET builder, camelCase `source` in POST bodies |
| 5-locale key parity for new `page.restore.source*` keys | test/restore-client.test.mjs (existing parity test) | identical key sets across en/de/es/fr/nl |
| i18n verb count 84 → 85 | test/i18n-core-features.test.mjs:171 | update pin + comment chain |
| Docs fidelity: DEPLOY.md contains OIDC_TRUST_TENANT_EMAIL lead, guest carve-out strings, symptom table markers; .env.example comment contains carve-out + "DEPLOY.md" pointer | new small test or extend a docs-pinning test (PITFALLS.md:138 recommends "cheap insurance") | fs-read assertions — no existing docs test file found; create `test/oidc-docs.test.mjs` mirroring the restore-client pattern |
| Zero probes on load (structural): `pageBackup`/`restorePreviewBody` source contains no `restoreProbe` call outside the click action; backups-GET kick is the only new load-path fetch | test/restore-client.test.mjs | assert the probe call sits only in `A.restoreProbe` |
| Existing suites must stay green | test/restore-source-param.test.mjs, restore-source-resolution.test.mjs (16 goldens), backup-history-client.test.mjs | no server changes in this phase → untouched |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| chip pickers | new dialog/modal component | the targetPicker chip idiom (backup.js:656-681) | same CSS/data-a wiring, drawer-native, tested |
| probe result mapping | new key→text table | actions.js:5448-5494 family idiom + existing `toast.*Probe*` keys | keyed classes already localized ×5 |
| availability truth | client-side flag derivation | server `sources[]` verbatim (D-23) | dormant-slot contract lives server-side |
| keyed error toasts | ad-hoc messages | `restoreToast`/`restoreMissingToast` (actions.js:5103-5137) | err.* code mapping central |

## Common Pitfalls

### Pitfall 1: Feeding the picker from the wrong payload
The preview GET has NO `sources[]` (GD-8). Feeding from history rows (restore_runs — no flags) or client-side flag math breaks the dormant-slot contract. Use `api.restoreBackups()` keyed by runId.
### Pitfall 2: Probing on render/load
Any probe fetch in the render path (including a "refresh badges" kick in `pageBackup`) violates D-89-14 and the zero-probes SC. Probe fires ONLY from `A.restoreProbe` clicks. A failed on-demand probe never clears a mirror flag (restore.js:1663+ owns that path).
### Pitfall 3: Sending `source: 'local'` to the probe route
The route allow-lists s3/ftp/smb only — local returns keyed 400. UI never renders a local probe control.
### Pitfall 4: Stale probe badges across drawers
`S.ui.restoreProbe` keyed only by source (not runId|source) leaks one run's result into another. Key by `runId|source` and reset on close/trigger.
### Pitfall 5: Locale keys landed in en only, or verb-pin forgotten
5-file parity is test-enforced; the i18n verb pin (84) hard-fails the suite if `restoreProbe` lands without the 85 update.
### Pitfall 6: Docs drift from code
Every DEPLOY.md claim must trace to server.js:6673-6727 (read this session, §Fidelity above). In particular: the substitution covers linking AND JIT, guests never covered, already-linked identities immune, generic `sso=error` surface.
### Pitfall 7: Mid-run picker illusion
After an accepted trigger the drawer is unmounted — do not add any source control to `restoreProgress` (:715-734); "retry from another mirror" is out of scope (new runId semantics, REQUIREMENTS RSRC-04).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Picker UX = chip row + per-source probe button (RSRC-04 says per-source vs check-all was "decided at discuss-phase" — no 105-CONTEXT.md exists, so this is the researched recommendation, not a locked ruling) | Picker Integration Recipe | planner/discuss may prefer check-all; markup adapts trivially |
| A2 | Default source = omit param (server registry order) rather than always sending sources[0] | Picker Integration Recipe | cosmetic; both honest |
| A3 | Download (`A.backupDownload`) does not need `source` threading for RSRC-04 (it names "the existing restore calls"; download is drawer-external) | Source Transport | if owner wants it, one-line `&source=` append |
| A4 | New docs test file `test/oidc-docs.test.mjs` is acceptable (no existing docs-pinning test found) | Test Plan | trivial file addition |
| A5 | `restoreSource` state slot naming (`S.ui.restoreSource`, `S.ui.restoreSourcesById`, `S.ui.restoreProbe`) | Picker Integration Recipe | naming only |

## Open Questions

1. **Per-source vs check-all probe UI (A1)** — REQUIREMENTS leaves to discuss-phase; recommend per-source (budget 10/15min per operator makes check-all fragile). Resolution path: discuss-phase or planner checkpoint.
2. **Download `source` threading (A3)** — include or not; owner preference.

## Sources

### Primary (HIGH — all read this session)
- src/pages/backup.js:219-246, :256-260, :588, :605-709, :711-780, :782-847 — history row badges, drawer, preview body, progress panel, page shell
- src/actions/actions.js:5103-5137 (toast helpers), :5448-5494 (probe toast families), :5652-5665 (download), :5692-5700 (verify), :5780-5850 (history fill + preview open/close), :5855-6017 (upload/new/overwrite/instance)
- src/core/api.js:520-531 (verify), :542-617 (restore family + doc block)
- server.js:9952-9975 (probe route, live), :10423-10475 (backups GET + sources[] verbatim), :10966-10986 (runs GET — no flags), :10986-11050 (preview route, no sources[]), :6673-6727 (OIDC trust-tenant-email, verbatim)
- docs/DEPLOY.md:285-400 — SSO section, linking policy :330-334, operator note :336-339, smoke checklist :341, group-mapping prereqs :365-392
- .env.example:173-177 — OIDC_TRUST_TENANT_EMAIL block verbatim
- test/restore-client.test.mjs:1-60, test/i18n-core-features.test.mjs:171 — test patterns + verb pin
- .planning/phases/104-*/104-VERIFICATION.md — GD rulings, probe route/throttle/sources[] verification, zero-new-deps gate

### Secondary
- .planning/research/FEATURES.md:26, :35, :113; .planning/research/PITFALLS.md:126-138, :161-170, :199-208 — picker conventions, probe-on-load pitfall, mid-run swap pitfall, docs-fidelity test recommendation

## Metadata

**Confidence breakdown:** SPA integration HIGH (all client anchors line-verified); transport HIGH (server routes read live); docs boundaries HIGH (line-verified + server fidelity read); picker UX shape MEDIUM→A1 (discuss-phase input).
**Research date:** 2026-11-28. **Valid until:** stable in-repo domain — 30 days.
