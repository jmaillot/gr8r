# Milestones

## v3.5 Backup Destinations SMB & FTP (Shipped: 2026-11-27)

**Phases completed:** 5 phases (96–100), 14 plans · 132 files, +17914/−464 LOC · gate 2672 tests / 2639 pass / 2 documented pre-existing failures (D-05 fr-typography, D-06 webhook-routes)

**Key accomplishments:**
- **Cross-destination seam generalization (DEST-01).** The S3 single-slot seam became an insertion-ordered destination registry (descriptor: enabled/manualPrefix/upload/rm/verify/config); dormant ftp/smb slots with boot-frozen `FTP_*`/`SMB_*` env custody mirror `S3_*`; per-task opt-in via `ftp_enabled`/`smb_enabled` columns (dual-engine DDL); Wave-0 static gate pins seam shape, D-04 order, single uploaded=1 write site.
- **Zero-dep FTP/FTPS client (FTP-01).** export/ftp.js on node:net/node:tls — USER/PASS, TYPE I, EPSV with PASV fallback + `FTP_PASV_HOST` override, STOR/DELE/SIZE, PBSZ/PROT P, NOOP keep-alive, REST resume, TLS session-reuse; golden-vector parser contract; vsftpd env-gated e2e.
- **FTP destination end-to-end (FTP-02).** Toggle in the task editor, staged upload after local publish with SIZE+sidecar verify, location badges in run rows and restore list, restore read-back via the shared staged seam, probe route cloning the S3 guard chain with typed error classes ×5 (authFailed/tlsFailed/passiveFailed/quotaExceeded/... + insecureTls warning).
- **Zero-dep SMB2.1 client (SMB-01).** export/smb.js (~1,600 LOC) on node:crypto — hand-rolled MD4 pinned by RFC 1320 vectors, NTLMv2 auth, unconditional HMAC-SHA256 signing with verify-before-dispatch, serial session engine with MessageId correlation, structural retry envelope (re-auth + single replay, offset-resume); NTLM material scrubbed from every surfaced error.
- **SMB destination end-to-end (SMB-02).** Same seams as FTP — toggle, staged upload + read-back sha256 verify, badges, restore twins (import_new + DR + overwrite), probe with SMB error classes ×5 incl. guestSession info flag; STATUS_NOT_SUPPORTED keys dialectUnsupported; real-samba e2e 5/5 (SMB2-min + guest pin + SMB3-min refusal; guest sessions proven to sign NOTHING — flag-gated unsigned both directions).
- **Mirror-truth maintenance (owner ruling).** A live staged fetch proving the remote object gone (ftp 550 / SMB not-found NTSTATUS / s3 404) clears the run's mirror flag — audited `mirror_flag_cleared:<dest>`, history auto-refreshes; NTSTATUS map completed (0xc000003a PATH_NOT_FOUND, 0xc0000056 DELETE_PENDING → pathNotFound) so SMB deletions clear like ftp/s3.
- **Follow-local remote prune (DEST-02).** Rotation removes rotated-out runs' SMB/FTP copies (remote_pruned additive column, soleCopy guard, per-destination containment, never touches live runs).
- **Restore surface honesty.** archive_name column (start events carry the filename; Run cell leads mono with the archive), preview/download/verify-checksum routes gained mirror legs (flag IS the truth, registry order s3 > ftp > smb), overwrite-restore gained s3+ftp+smb read-back twins, restore emails name the project (overwriteProject branch ×5), restoreArchiveMissing surfaces the seam error + auto-refresh.
- **Ops hardening found by owner UAT (11 rounds).** SMB upload corrupt-by-construction FIXED (write(path) wrote path text; now readFileSync + R-4 read-back sha256 verify at upload); Run-now per-task opt-in parity (taskId gates all three registries); pre-restore snapshots stay LOCAL (never mirrored); workspace-logo blob id fixed.

**Owner UAT:** validated 2026-11-27 on the real Synology NAS — backup → mirror → restore → overwrite on local+S3+FTP+SMB; scheduled-run badges; out-of-band deletion badge clearing (FTP, S3, SMB); SMB restore confirmed working end-to-end. Deferred to backlog: GFS rotation live UAT (2-day-retention job, observe with prune badges); restore-source selection (phase 101 / v3.6).

**Integration audit:** PASS — 8/8 surfaces wired, 4/4 E2E flows complete, 0 blockers (.planning/v3.5-MILESTONE-AUDIT.md + v3.5-MILESTONE-AUDIT-INTEGRATION.md).

---

## v3.4 UX Polish & Backup Console Refinement (Shipped: 2026-11-24)

**Phases completed:** 5 phases (91–95), 10 plans, ~40 tasks · 53 files, +5092/−806 LOC · 48 scoped commits

**Key accomplishments:**
- Digest dedup (NOTIF-01): root-caused the 4× duplicate to per-workspace transport rows; one per-user outbox row per user/day inside the same tx, workspace-grouped sections, user-locale rendering, global unsubscribe, restart/MAILER-off paths proven never to double-send — red regression test pinned first.
- Server payload contracts (BKNAME-01/02): GFS naming with server-resolved workspace/project names (never raw ids), one pure GFS function shared with rotation stored in an additive `gfs_bucket` column (SQLite+Postgres lockstep), `describeCron` structured descriptors, unified runs `?all=1`, operator-gated `/api/backup/scopes` — `workspacesForUser` byte-unchanged.
- Instance Roles governance UX (ROLE-01/02/03): role-tabbed roster with stacked grant entries, selectable user pickers (Teams Edit-team contract) with working Grant-dialog search, zero new mutation endpoints, audit funnel untouched.
- Backup console UX (BKUI-01..04): real task table with humanized schedules and honest Next/Last run columns, pre-filled editor seeded from the server descriptor, all four GFS retention scales, unified cross-task run history with fail-closed per-run authorization — 11 owner UAT rounds absorbed.
- Settings polish + cross-workspace pickers (XWS-01, SET-01..04): My Access card grid grouped by workspace, revoked-key purge with append-only audit, one-line Workspace URL, Edit-Teams picker parity — membershipsOf byte-gate pinned by test.
- BKRST-05 project-overwrite restore (owner request): `restoreOverwriteUnit` project branch — doc-splice ids-verbatim, D-01 deletion set with transitive task closure, self-excluding collision scan (typed refusal ×5), pre-restore snapshot DR, one tx, global restore lock unchanged (owner-confirmed one-way ruling D-04); drawer offers Restore-as-new AND Overwrite with confirm-phrase vs current name.

**Closeout note:** override_closeout — 91–93 verifications "stale" (covered-source digests predate phase-95 shared-file changes), covered by the phase-95 regression gate (2492 tests, 2 documented pre-existing failures) + owner UAT on Prod; 94 verification frontmatter added at close (PASS 5/5 pre-existing); 95 verified passed 20/20 + 4/4 owner UAT. 1 audit-open item acknowledged (94-UAT status artifact, 0 pending scenarios). Known verification overrides: 1 newly acknowledged (94-UAT), 32 carried forward.

## v3.3 Instance Operations — Backup, Restore & Roles (Shipped: 2026-11-23)

**Phases completed:** 6 phases, 21 plans, 18 tasks

**Key accomplishments:**
- `instance_roles` table + pure `roles.js` capability funnel (ARCHIVE_READ reserved, Super-Admin short-circuit inside) behind Super-Admin-only audited grant/revoke routes and gated `/api/backup/tasks` stubs, with payload `canBackup`/`canRestore` flags and 55 pinned tests green.
- gr8r backup v1 export pipeline: hand-rolled ustar+gzip writer, two-pass staged choreography (snapshot fence → collect+NDJSON → hash → tar → fail-closed self-verify → atomic rename), scope-containment file collection, and the frozen manifest entry-0 format Phases 87/88/89 consume — verified end-to-end on SQLite and LIVE Postgres (identical per-table sha256).
- Frozen trigger/poll API over the 86-01 export pipeline — POST /api/backup/runs returns the D-18 UUID behind the full guard chain (throttle → gate → scope → concurrency, every refusal keyed AND audited), GET current serves the D-19 payload, and the Backup page grew a scope-picking Run now card with live stage progress rendered verbatim from the poll.
- Exactly-one-bucket GFS rotation (yearly/monthly/weekly/daily, keep-N per bucket, newest-verified excluded by id) hooked into the writer-seam complete event, plus D-15/D-16 transition-only backup alert emails (backup_operator role + instance admins) via a third POL-02 outbox claim site and a full MIME mailer builder.
- Backup page task console — builder-based schedule form (4 presets + Custom 5-field dropdowns, no free-text cron), reused tz combobox, toggle/delete/Run-now per task, verbatim per-task run history card, 5-locale parity.
- Zero-dep SigV4 S3 client (`export/s3.js`) pinned by AWS-documented golden vectors, proven end-to-end with a signed PUT→GET roundtrip against the user-ratified `pgsty/minio:latest` image, plus keyed error mapping (s3ClockSkew, SC-3), D-88-15 probe, and the Phase 89 download seam.
- Boot-frozen `S3_*` env custody with an additive `s3_enabled` column and a CHECK-widened `backup_runs` status enum (invites-rebuild idiom, dual-engine lockstep), plus the `s3Enabled` task gate with audited keyed refusals and a probe-at-save route returning keyed results (success / deleteFailed / badCreds / s3ClockSkew / unreachable + httpWarning) — all keys in 5 locales, same commit.
- Zero-dependency ustar+gzip stream reader + D-89-33 allow-list gate + bounded staged extraction for the frozen 86 "gr8r backup v1" archive format, with keyed refusal classes ready for the 03/04 route handlers
- restore_runs + restore_lock on both engines (single-row CAS, D-89-31), the D-89-29 stage-vocabulary writer seam, boot sweeps that heal stale runs and release stale claims, and the D-89-1 export-side mutual exclusion (trigger 409 + scheduler skipped_overlap while a restore holds the lock)
- Honest dual-location restore list and a stream-verified manifest-derived preview route (BKRST-01) — run-row-truth badges, one-pass sha256+manifest verification, keyed refusal mapping for every 89-01 producer class, zero archive bytes to the client.
- BKRST-02 import-as-new restore engine — pure planRemap with totality-validated full-ID remap, one-transaction restoreImportAsNew with a frozen `{ skipped: [{table, rows}], memberships: {skipped, inserted} }` skip report, POST /api/backup/restore trigger + poll/history routes behind the verbatim backup guard chain, and D-89-28 outcome emails riding the outbox transition gate with EN fallback pending plan 06.
- Guarded overwrite + Super-Admin-only instance DR: snapshot-first destructive units behind server-revalidated type-to-confirm routes, with the D-89-1 mutual exclusion proven end-to-end
- Restore client surface on the shared Backup page — 7-method api family, payload-flag-gated restore section (list + manifest preview drawer + stage panel + history card), ONE shared poll timer for both surfaces, exact-name/exact-phrase confirm flows, closed refusal-toast map, 67 new locale keys ×5 — closing the error-codes catalogue suite.
- Kept-until retention visibility as an always-true bucket-position badge (`kept: 3/7 daily`), an on-demand mutation-free rotation-deletion preview endpoint behind the D-89-22 throttle, and the D-90-23 missing-blob warning stamp + D-90-22 restore-list invalidation — 13 new i18n keys ×5 locales in the same commits as the emitting markup.
- 18-test DST boundary matrix on the pure cron contract (EU+US, spring+fall, 2026+2027, instants computed live through `nextRunAt` itself), one env-gated PG-parity e2e that drove the whole backup→S3→DR-restore cycle through the live containers — and exposed + fixed a real DR bug (uploaded-only archives were unrestorable) — plus the DEPLOY.md trust documentation (backup engines, NTP posture).

---

## v3.2 Entra Group Mapping & Governance Backlog (Shipped: 2026-11-21)

**Phases completed:** 5 phases, 12 plans, 9 tasks

**Key accomplishments:**
- Inert groups.js core (GUID canonicalization, keyed refusal funnel, four-outcome overage detector, D-82-1 highest-role-wins resolver with operator-flag tri-state) plus the group_mappings table in both schema mirrors, pinned by a pure zero-boot unit suite
- Operator-gated POST /api/governance/group-mappings with four keyed 5-locale refusals, D-82-6 dead-mapping boot warnings, and the groups.js Dockerfile COPY contract — nothing invalid ever stored, empty config boots byte-identically
- Operator rename route (Phase 79 guard order, slug rules reused verbatim, no existence oracle) + on-read dead-mappings route (orphans + encoded guard trail) with their api.js client methods, proven by a 17-case Wave 0 node:test suite.
- Governance Edit modal (name-only direct save, slug-change danger confirm with the old slug bold via esc() and type-to-confirm), one-click slugTaken-suggestion adopt, display-only dead-mapping warning card (hidden entirely at zero items, first-colon trail split), and 14 five-locale keys — pinned by 8 new source assertions.
- Repaired all 4 failing e2e specs root-cause-first (operator nav swap to /governance, STOP_LIST cognate 'Instance', flows 2FA nextWindow/retry hardening) — full suite 155/155 green ×3 consecutive, zero debt waivers.
- Searchable multi-add team pickers (assignee-modal clone, own lazy chunk) on invite-form and member-edit with D-03 keyboard contract, plus the IN-02 derived i18n catalogue check replacing the 2030 pin.
- Columns button label collapses at phone width via the sibling hide-m pattern, phone-viewport overflow sweep (dashboard/members/governance) pinned green with zero overflow found, and the rename route now stamps updated_at = now() (IN-01) with a unit pin.

**Known gaps / tech debt carried forward:**
- Nyquist VALIDATION.md missing for phases 80, 81, 82, 84 (83 is a draft) — requirements were verified goal-backward instead; fill via `/gsd-validate-phase` if desired.
- Ship-gate e2e env now pins `SUPER_ACCESS=false` (milestone-close decision 2026-11-21): the suite tests pre-super-access tenancy semantics; the super-access default path is covered by unit tests (test/super-access.test.mjs) only.
- 20 artifact-audit items carried forward as acknowledged (suppressed in future audits); seed captured for next milestone: Super Admin console role-first listing (`.planning/seeds/super-admin-console-role-first-listing.md`).

---

## v3.1 Workspace Governance (Shipped: 2026-11-20)

**Phases completed:** 2 phases, 5 plans, 5 tasks

**Key accomplishments:**
- `WORKSPACE_CREATION` strict-token boot gate (unset=false fail-closed, boot-refuse on any other token) decoupled from `ALLOW_SIGNUP`, with operator-only closed-gate enforcement, `/api/config` boolean, and console-managed multi-seat operator promote/demote endpoints backed by transactional audit rows.
- Gate-aware client — gated users lose every creation surface and get an honest await-access page with a 15 s visible-tab-only poll that soft-enters the app once membership or operator rights appear; operators manage multi-seat operator identity from the console (D-90 inline-confirm promote/demote on the 78-01 endpoints, lastOperator 409 as a keyed toast), proven end-to-end in the browser on a closed-gate throwaway server.
- Soft-archive flag + operator-gated /api/auth/operator/workspaces route family (listing, archive/unarchive, empty-only delete with orphan dispositions, member reassign/release) behind the requireWorkspace archived funnel, proven by a 14-test RED→GREEN suite
- Operator governance page (every-workspace table with filter/segments, slug type-to-confirm archive/delete, orphan disposition modal blocking until every member is reassigned or released) backed by 46 new locale keys × 5 catalogues and an 8-assertion TDD client suite.
- operatorCard promote/demote/revoke UI relocated verbatim from Settings into the governance page as its Operators section — Settings stripped to zero remnants, Phase 78 endpoints untouched, full suite 1954 pass / 0 fail.

---

## v3.0 Access Control & Hardening (Shipped: 2026-11-19)

**Phases completed:** 3 phases, 7 plans, 10/10 requirements

**Key accomplishments:**
- Instance-level email-domain admission per the owner-validated SEED-261119-f3w door matrix — one shared canonicalizing funnel (`domains.js`), exact `Set` matching (never `endsWith` — verified bypass vector), tri-state env parse (unset = inherit/fail-open, empty = deny-all), `'*'` wildcard allow-all, zero new dependencies.
- Five decision points (DP-1..DP-5) across signup, invite create, fail-closed non-consuming invite accept, MCP invite, and OIDC JIT — each door checks exactly one list (invite-crosses-domains preserved); every refusal key landed in all 5 locale catalogues (en/fr/nl/de/es) in the same commit as the first emitting gate.
- Existing-account immunity proven by named contract rows: authentication never consults the lists, tightening never locks out members, and accept-time re-validation applies to ALL admits (Option B, owner-approved) with non-consuming refusals revived by loosening.
- Standing gates made honestly clean: lint exits 0 with zero suppressions added (hazard-safe per typescript-eslint #3456), 9/9 carried review advisories fixed with regression pins (ledger open: 0), and nl/de/es refusal rendering verified end-to-end in the built app — uncovering and fixing a real `LOCALE_CODES` production bug.

---

## v2.7 Installable App (PWA) (Shipped: 2026-11-19)

**Phases completed:** 3 phases, 7 plans, 9 tasks

**Key accomplishments:**
- Installable-app wire contract shipped: hand-written manifest.webmanifest served with `application/manifest+json` + `no-cache` via a 3-touch server.js diff, head tags in index.html, everything double-pinned by a static contract test and a live e2e header check.
- Five owner-approved opaque PNG install icons (any 192/512, maskable 192/512, apple-touch 180×180) rendered from favicon.svg's light-scheme palette plus the maskable SVG re-render source, frozen by a byte-level PNG contract test (exact IHDR dimensions, apple-touch opacity, manifest cross-check).
- Chromium install banner end-to-end as a lazy chunk — captured-event strip with prompt-from-gesture, 14-day localStorage cooldown, iOS boot-time hint pre-check, Firefox silence — proven by 20 node:test unit/contract cases plus a real-vite-build entry-delta gate (entry 495,560 vs 499,995 baseline, delta −4,435).
- Platform degradation matrix proven (iPadOS clause, Firefox silence, boot-shape pin) plus four Playwright journeys — stubbed-event EN→prompt, dismissal persistence across reload, FR after a real language switch, and an iOS-simulated boot that exposed and fixed a real checkIos() hydration race — 25 unit cases + 4 e2e green, zero new dependencies, entry untouched.
- onBip now survives the pre-hydration `beforeinstallprompt` race with a checkIos-shaped 300-frame rAF retry, proven end-to-end by a delay-free e2e scenario that is measurably RED against the old one-shot code, plus a single-clock-base cooldown boundary test.
- Automated sw-contract test proves `public/sw.js` is byte-identical to the Phase 48/59 contract (sha256 pin) and locks the single `navigator.serviceWorker.register` call site, `/sw.js` literal, `api.enabled` gate, both boot paths, and manifest↔SW scope agreement — zero production code changes.
- DEPLOY.md §18 documents the full PWA operator posture (root-domain-only, iOS manual A2HS, no-back-button stance, strictly-online, no-custom-SW rationale, Lighthouse troubleshooting) and 74-UAT.md carries 4 passed real-device test results — PWA-03 complete, v2.7 milestone accepted end-to-end.

---

## v2.6 Exports Verification (Test 11) (Shipped: 2026-11-18)

**Phases completed:** 3 phases, 11 plans, 9 tasks

**Key accomplishments:**
- Lifted the three subtask exclusions — Board lanes gain flat dotted-key child cards (counts = parents + children), Timeline gains parent-grouped DFS child bars with real-depth indent (depth+1) and per-bar status (statusLabelById retired), SHAPE_CAP 400 stays strict child-inclusive; CSV/MSPDI/Tasks-sheet/route untouched.
- one-line model fix (`due: s.due || t.due || ''`, exact mirror of the start inheritance on the previous line) + TDD pin rewrites so a manually-set subtask due wins in every export channel while due-less subtasks still inherit the top-level task due.
- Subtask meta cells now sit at the same horizontal px offset as the parent task's cells under each column header: one CSS rule (`padding: 0 8px` on `.subrow > .c-meta`) plus a grow-only source-contract pin, closing the cosmetic gap G-71-1 reported in 71-UAT.
- .subrow .c-status .stchip now carries the .pillbtn padding/height/radius contract (0 7px / var(--h-sm) / var(--r-sm)) so chip content sits at the parent pill's content x-position, pinned by 3 new grow-only e2e tests measuring inner chip content vs pill content-box edge on List, My Tasks, and depth-2.
- Wrapped the subrow assignee/priority/due cell content in a `.stpill` element carrying the parent `.pillbtn` padding/height/radius contract, and pinned the inner-content alignment metric for all three cells in the e2e spec on both call sites.

---

## v2.5 Template Polish & Import (Shipped: 2026-11-16)

**Type:** owner-directed quick work (no formal GSD phases — 67-05/67-06/67-07)
**Closeout:** verified_closeout (2026-11-16) — milestone audit PASSED (4/4 requirements, all gates green, UAT verified on the Docker server)
**Git range:** `v2.4..f99359c` — 8 commits, 27 files, +1068/−88

**Key accomplishments:**
- Subtask tree indent fixed at the root: the shared renderer now emits `--ind` and every surface ADDS it to its CSS base (`calc(base + var(--ind))`) — the list view's 64px base no longer pulls children left of their parent; the e2e asserts real content-box geometry (65-05).
- Template favourites shipped end-to-end: persistent `fav` flag through the sanitizer, star buttons in Settings, favourites-first in both "From template…" pickers, and a create-modal Favourites block that instantiates on one click (67-05).
- Template import from Markdown: a pure DOM-free parser (front matter, `##`/`###`/`####` nesting for both kinds, `+Nd` offsets honoring D-05/D-07/D-08) lands a draft in the ORDINARY editor — review before Save, funnel re-validation on save (67-06).
- Two complete downloadable per-kind examples (task: 3-level tree, offsets, priority; project: 4 tasks with 3-level nesting), each parse-verified; visible labels after owner UAT flagged the icon-only buttons (67-07).
- The six built-in starter projects became hideable via a `prefs.hideStarters` workspace toggle; Projet vierge (blank) always shows; onboarding untouched by design (67-07).
- Gate discipline discoveries documented: the icon scanner captures any bare quoted Lucide name (label keys must not collide — `importBtn`), and examples stay EN-only (no-French-byte build gate).

**Deferred:** Phase 65 UAT Test 11 (exports/MS Project real import) carried to backlog; lint baseline 15 pre-existing errors unchanged.

---

## v2.4 Automation & Productivity (Shipped: 2026-11-16)

**Phases completed:** 4 phases, 17 plans, 1 tasks

**Key accomplishments:**
- Proved the D-01/D-03 flat subtask-tree storage shape end-to-end — `{ id, parentId, position }` round-trips byte-identical through the mergeClientDoc whitelist sink, legacy docs heal lazily, crafted cross-task linkage never persists — with the shared DOM-free `subtree.js` module and the Wave-0 test harness all later plans extend.
- The server now owns tree legality — cycle/depth-violating restructures are rejected wholesale at the mergeClientDoc funnel with tx-atomic rollback and localized `subtaskCycle`/`subtaskDepth` codes — while completion cascades symmetrically at every level (D-14, reopen cascades nothing per D-13), deletion removes whole subtrees, and parent progress became a leaf-only rollup with zero double-counting at both duplicated definition sites.
- The multi-level subtask tree is now user-visible everywhere — drawer checklist, list/table subrows, board open-leaf badge with a popover checklist, and indented collapsible timeline bars with date inheritance — all through ONE shared recursive renderer ordered by the single `orderedSiblings` comparator, all progress leaf-based via the 65-02 rollup, collapse state session-only in `S.ui` (D-10).
- The subtask tree now survives every non-view surface — subtask titles are searchable on both backends through one byte-identical folded suffix and forget deleted ones on the next funnel write, exports walk the tree in (position, arrayIndex) order with per-level keys, true depth and MSPDI OutlineLevel, and MCP writeDoc faces the same subtree gate as the funnel while stripping members without losing tree shape.
- Exactly-once webhook delivery substrate — UNIQUE dedup_key claim, SSRF-guarded HMAC-signed fetch (redirect:'error' + 10s timeout), D-05 5-strike retry with Retry-After, D-07 7-day purge, and task.created wired doc-PUT → diff → in-tx claim → post-commit fire-and-forget.
- All 8 webhook events fire from their two emission sites (doc-PUT diff + runReminderPass, dedup-shared, no double-fire), whitelisted envelopes format into teams-adaptive / teams-messagecard / raw-json under a UTF-8-byte-measured 28 KB cap with truncate-and-deliver, real AAD `<at>` mentions resolve from `users.oid` persisted at Entra login.
- Owner/admin/leader-gated hook CRUD (create/list/edit/delete) with a server-generated secret returned exactly once, https/format/event-filter validation, D-06 health derived from dead deliveries, and a D-11 send-test endpoint riding the identical SSRF-guarded, HMAC-signed, 10 s-timeout delivery pipeline with an immediate visible result.
- Test webhook payload body rebranded from « gr8r » to « Projects Studio » in server.js, closing gap G-67-2 with green webhook suites (23/23)
- Scoped the WR-01 squeeze fix to `.page.flush .toolbar` ≤900px (POL-03/D-09) with a byte-level Wave-0 test, and formally accepted 64-VALIDATION.md per audit-milestone §5.5 (POL-04/D-10).
- Notification and digest emails moved from fire-and-forget to the Phase 67 claim-then-deliver machinery — a new `email_outbox` transport-claim table (byte-identical on SQLite+pg), claim inserts inside the semantic-claim transactions, and a `runEmailDeliveryPass` drain with webhook-identical backoff (1m→5m→30m→2h→8h), dead-state and 7-day silent purge.
- The mobile card stack (.mcard, ≤900px) now renders priority/due/estimate/progress as a pure function of the existing hidden[] view state — driven by the re-enabled cols popover — with status/title/key/assignees structurally exempt (minimum identity), proven by a dedicated 390×844 e2e.

---

## v2.3 Consolidation & Hardening (Shipped: 2026-11-15)

**Phases completed:** 3 phases (62–64), 9 plans
**Closeout:** verified_closeout (2026-11-15) — milestone audit PASSED
(`v2.3-MILESTONE-AUDIT.md`): 7/7 requirements satisfied, 5/5 cross-phase integration
chains wired live, 0 conflicts, 0 open artifacts. Zero waivers at close.

**Key accomplishments:**
- E2E readiness contract race-free: `/api/health` is the sole readiness owner, `assertServerUp()` is a fail-fast single fetch wired into all three fixture paths — zero ECONNREFUSED 127.0.0.1:4317, `reuseExistingServer`/retries/`gracefulShutdown` untouched
- The 9 drifted specs (french-overflow ×7 + locale:122) repaired against the lazy-chunk Settings contract via role-based queries (native `<select>` by its combobox role) and auto-retrying waits; shared `openSettings()`/`selectLanguage` helpers in setup.mjs so exactly one place knows the lazy-chunk contract
- VIEW-02 flake root cause proven with trace evidence (coordinate-click popover dismissal + un-awaited debounced `persistLiveView` PUT) and fixed at both sites: semantic Escape dismissal + `waitForResponse` arm-before-act — deterministic at retries=0 (10× repeat proof)
- Mobile hide-the-button contract: Columns popover hidden ≤900px by a generic `[data-pop='cols']` rule in the existing 900px tier; Option B band (641–900px card stack); desktop untouched (projects-table/saved-views specs green unmodified)
- Honestly usable card stack: wrap-everything CSS, zero horizontal overflow at 390×844 proven red→green by TDD, long-task truncation suite, toolbar flex-shrink fix (mode tabs were clipped at 390px); card template polish under the 500 kB chunk gate (498.11 kB)
- Close run: **115/115 e2e passed (6.9m), 0 failed, 0 flaky, VIEW-02 included**, unit 1524/1524, lint clean, chunk gate 498.11 kB < 500 kB (threshold untouched), EN+FR i18n green — zero waivers, zero D-16 fixes needed

---

## v2.2 Notifications, Search & Delivery (Shipped: 2026-11-14)

**Phases completed:** 6 phases, 19 plans, 14 tasks
**Closeout:** override (2026-11-14) — init.manager stale bookkeeping on phases 56-60
(STATE.md is source of truth, 6/6 Complete, each phase verified in session); no
v2.2 milestone audit run; 1 newly acknowledged deferred item (56-02 e2e 9 specs),
19 carried forward.
**Post-close fix:** notifyMembers duplicate-unread refresh ruling shipped `c03404a`;
lint baseline errors fixed `0ca7ff1` (lint fully clean at close).

**Key accomplishments:**
- D-02 500 kB build gate installed as a real-build test + async renderPage loader map splitting settings into its own chunk (entry 606,073 → 552,830 B)
- D-02 500 kB gate GREEN without touching the threshold: entry 552,830 → 499,780 B via design-system/members/activity/search lazy chunks + the seed-lazy migration (inline emptyState fallback, explicit async ensureSeedData)
- Content-hash staleness detection: every `vite build` stamps sha256 of dist/.vite/manifest.json, and e2e/server.mjs refuses to boot a stale dist fail-closed with `e2e: dist/ stale — run \`npm run build\`.` — proven by a three-case spawn test on the real wrapper.
- `saved_views` rows (sentinel name='') behind revision-free `/api/me/views` routes, a pure localStorage mirror for demo mode, debounced write-through on column toggle, and the idempotent boot sweep that moves legacy `doc.views` into owner-attributed rows and strips the field at all three sites — VIEW-01 proven end-to-end by 14 new tests.
- Server-guarded named views (≤20/member/key, 2 kB blobs, case-insensitive unique names, lenient old-schema loads) behind the `/api/me/views` routes, a lazy savedViewsUi popover that saves/applies/updates/deletes them with an explicit overwrite confirm, and the D-14 live-row reset completed server-side.
- `prefs.defaultPrivate` — an owner toggle that seeds `private: true` on newly created projects (client `createProject` + server `mergeClientDoc` parity, stored-doc reads only, explicit choice always wins), an informational Access-tab hint, zero changes to the visibility funnel, proven by 6 server pins and a full owner-story e2e.
- Contentless task_fts shadow index (FTS5 unicode61 remove_diacritics 2) synced in-transaction from both write sites (doc-PUT funnel + MCP writeDoc), membership-gated GET /api/workspaces/:slug/search route with byte-level-leak-proof per-hit filtering, and a conditional boot sweep that heals drift.
- Dialect-complete FTS on pg — `task_search_projection` (JS-folded plain text + `to_tsvector('simple')` + GIN) maintained by the same in-tx `syncTaskFts` path, implicit-AND prefix `to_tsquery` search with ts_rank + task_id tiebreak, boot-sweep healing — proven byte-for-byte behavior-identical to SQLite by the DBA parity suite ("elodie" finds "Élodie" on both backends), with zero extension dependencies (D-12).
- Entry-chunk-safe `searchTasksServer` (demo-gated, abortable, silent-degrading) with a 250 ms debounced AbortController dispatcher merging server tasks into the Ctrl-K palette's instant local list (deduped by id, local-first), and the /search page merging server-only rows into the existing task-row markup with hl() titles and plain-text snippets — all standing gates green.
- One-line guard fix releases the Ctrl-K palette's hybrid server merge into cmd mode, with a 5-case dispatch-matrix regression test locking the behavior (TDD RED→GREEN)
- push_subscriptions mirrored on SQLite+pg with endpoint-UNIQUE replace, env-overridable /data-persisted VAPID custody proven by a restart tracer test, fail-absent push-config, self-service subscribe/list/delete routes, web-push@4.0.0 exact-pinned, push_due re-livened per D-09.
- `sendPushFor()` mirrors the email gate order (self-suppression → per-type pref → memberCanReadProject at send time, never digest-suppressed, never MAILER-gated) at both fan-out sites, with the 404/410 same-pass row sweep, the 4096-octet payload budget proven with pathological FR titles, and a per-device test-send route riding the real payload path.
- Service-worker push handler with open-tab suppression + deep-link display, gesture-gated Settings opt-in with device list and per-device test push, owner UAT passed 6/6 on production.
- Two read-only routes in server.js — the admin-gated four-panel aggregate dashboard computed over the RAW stored doc (power-admin ruling, exact-403 matrix) and the member self-view of the Phase 52 visibility funnel (byte-level TRN-02 redaction) — locked by 34 new tests with hand-derived fixture expectations.
- The admin-only `/w/:slug/dashboard` lazy page (four panels rendered verbatim from the 60-01 aggregate, skeleton-then-fill, 30 s poll with abort + route-exit teardown, deep-linking rows, 24h/7d/30d activity selector) plus the Settings › My access self-view section reusing the Phase 52 reason vocabulary, proven by a Chromium e2e that walks the per-role story end-to-end.
- Test-first closure of all three Phase 60 verification gaps — bounded fetch kick (CR-01), poll re-entry restart (WR-01), and whitelist-before-parse ordering (WR-02) — each pinned by a regression test that failed on the pre-fix behavior.

---

## v2.1 Member & Project Experience + Export + Multi-assignee parity (Shipped: 2026-11-11)

**Phases completed:** 3 phases, 18 plans, 19 tasks

**Key accomplishments:**
- Per-team permission levels stored as `p.perms['team:'+teamId]` keys, enforced server-side through the doc-PUT funnel by `projectPermFor` on every content write, with the visibility oracle + client/MCP mirrors proven in lockstep.
- Invite email draft bound with a silent `data-in` binding, Projects chips feeding the invite scope, and the guest = exactly-one-project invariant enforced by one shared server validator across create/edit/accept — with D-06 disable+hint in EN+FR and the MCP invite-tool ceiling pinned by test.
- One `projectSettings` modal (General + Access tabs) replaces both projectModal and shareModal — per-team perm dropdowns on `p.perms['team:']`, full data-in discipline with per-field survival e2e in EN+FR, and honest concurrent-edit conflict surfacing.
- Projects table gains a Members count column and a per-row settings gear to the unified modal's General tab; the project page is reduced to exactly one labeled Share button opening the Access tab, with dead keys pruned and pins bumped in the same commits.
- Edit Team members box gains foldForSearch accent-insensitive search that never loses checked state; the owner's multi-team hint replaces the primary-team wording in EN+FR; the team page loses its invite button; the milestone i18n gate closes at 0 dead / 0 stale with the unit suite fully green.
- Ordered MSPDI XML serializer (exact schema order, five Text field IDs, estimate-grammar durations, resolvable finish-to-start links) wired into the route and modal with EN+FR catalogue; Microsoft Project open check left open as UAT per owner skip verdict.
- Read-time normalize migrates every task/subtask scalar `assignee` to an invariant-enforced `assignees[]` array (dedupe, junk/non-member strip, cap 5, scalar deleted), the write-guard re-derives `memberCanReadProject` per member over tasks AND subtasks, member removal sweeps arrays (empties stay `[]`), the reminder/digest passes read arrays per member, and assignment event logging is diff-based.
- Per-assignee reminder fan-out proven by test — five multi-assignee fixtures (mixed-TZ windows, prefs-off isolation, replay exactly-once, private-project read-check isolation, subtask-exclusion) over the fan-out loop 55-01 landed; server-side scalar `assignee` reads verified gone (only normalize migration input remains).
- Every client membership predicate, filter, group-by, sort and drag-drop path now speaks the `assignees[]` array — `includes(me)` membership everywhere, any-of filtering with an explicit `'none'`→empty-array sentinel, multi-assignee tasks land in every member's group, drag-drop replaces the array, and `assignableInProject` takes the array for the picker.
- The single-assignee pop is replaced everywhere by a chip-pattern search modal (draft in `S.ui.assigneePick`, data-in-bound search, `assignableInProject` candidate filter, cap-5 block with EN+FR hint), the confirm applies the whole draft as one array write, and removed assignees now get the `notif.assignRemoved` notification while untouched members are never pinged.
- The export model carries the full `assigneeIds` array per task/subtask row with comma-joined name cells (one row per task everywhere), per-member KPI/Members counts count a shared task once per member, and MSPDI emits one Resource per member plus one Assignment row per task×assignee pair in task-major order.
- Subtasks render and write `assignees[]` through the shared picker modal (avStack rows, first-name +N label, scalar reads gone), and subtask `start` dates work end-to-end — detail-view Start row, `substart` date pop with inherited tips EN+FR, promotion inherit, and export model rows writing `s.start || t.start` for MS Project.
- avStack(ids, 3) with an always-on overflow-chip tooltip replaces every scalar `av(t.assignee, …)` render across board/table/timeline/calendar/task-list/home/search/recents, with the 55-04 picker wiring and empty-assignee behavior preserved.
- Project-scoped invite accept no longer moves the workspace revision (bumpRevision:false), 409s recover by re-hydrating + resetDirty instead of dead-locking the 30s poll, and assignableInProject offers p.members grantees — the assignee-picker roster is live without reboot.

**Verification:** all 3 phases re-verified passed post-fix (53: 17/17 with 2 owner overrides · 54: 13/13 · 55: 8/8); requirements 13/13.
**Known verification overrides:** 5 newly acknowledged, 7 carried forward. Closeout type: override_closeout — the human Microsoft Project/xlsx visual check (54-05) remains open, owner-acknowledged ("no Project machine"), carried to the backlog alongside the round-3 UI-spec adjustments recorded in 53-VERIFICATION.md.

---

## v2.0 Project-level Permissions & Invitations (Shipped: 2026-11-09)

**Phases completed:** 4 phases, 17 plans, 10 tasks

**Key accomplishments:**
- 13-cell visibility fixture with a hand-derived (probed, anti-tautology) oracle, a green-today set-equality + byte-identity migration harness, a server↔MCP parity harness across every actor shape, and model-neutral 404 body-equality rows — all green against the unchanged old-model server, giving Plans 02/03 an independent verification oracle.
- Collapsed visibility to boolean-private ∨ access list across server + MCP mirror, retired every scope writer (route, invites, addMembership, promotion), and rewrote the suites to the collapsed model — 1079 pass / 0 fail with canaries unmodified.
- Repo-wide residual sweep cleared (one real code fix: mcp legacy `p.access` fallback deleted), permissions docs rewritten to the collapsed model, all five Phase 49 success criteria individually evidenced — 1079 pass / 0 fail, canaries byte-unmodified.
- The one-boot visibility sweep now detects the pre-Phase-32 scalar `p.team` marker, converts it with the retired 2eec642 semantics before the grants loop, and pins the materialized grant end-to-end with a new `p_legacyteam` fixture cell — closing verification gap CR-01 plus review warnings WR-01/WR-02.
- restoreTeamLinks now removes only p.members entries positively provable as team-derived (member_id → memberships.user_id → team_members ∩ restored teams), and the invite.project p.members grant runs for every successful accept (existing members keep their role).
- Share-modal private toggle made real end-to-end (two-state control, optimistic revert, doc-sync only) plus the two missing server capabilities — stored-prefs-only `permCreate` enforcement with a scoped keyed `projectCreateForbidden` refusal, and server-enforced creator-as-lead — pinned by 13 new authority-matrix/project-creation/team-link tests; full suite 1119 pass / 0 fail.
- The share modal gains a canManage-gated Teams section (invite list excluding linked teams, linked-teams note with remove, live-semantics copy, Member-level invites on doc-sync with snapshot revert), clients that lose a project render an honest localized not-found state via an applyDoc visibility-epoch marker, and restricted members get a disabled-with-tooltip create control whose refused attempts map the server's keyed `projectCreateForbidden` to a localized toast + optimistic-insert revert — 8 new EN+FR keys, full suite 1123 pass / 0 fail.
- The Settings > Permissions page is gone end-to-end (nav entry, case body, permGuests/permPublic toggles, 6 catalogue keys EN+FR) with permCreate relocated to Workspace > General under the phase-wide `=== true` polarity, unknown `?sec=` deep-links fall back to the first tab, and the i18n gate gains a dead-key detector — shape-based reference collection over src/ + server surfaces, gated into `i18n:scan`/`prebuild` — whose first sweep deleted 17 more orphaned keys (catalogue 1718 → 1701); full suite 1130 pass / 0 fail / 11 documented skips.
- Both permission domain docs rewritten to the shipped Phase 51 model (two-state share-modal toggle with optimistic revert, Teams section with live semantics and Member-level invites, the D-51-17 lead role mirroring `canManageProject`, permCreate as a real server-enforced setting, Permissions page removed end-to-end) with D-NN-tagged supersessions and file:line references verified against the live tree; all five roadmap success criteria individually evidenced; full suite 1130 pass / 0 fail / 11 documented skips and i18n gate fully clean.

---

## v1.10 Extensions & Adapters (Shipped: 2026-11-07)

**Phases completed:** 4 phases, 9 plans, 7 tasks

**Known verification overrides:** 1 newly acknowledged (phase 45 full-suite flake — resolved
non-issue, verified firsthand), 13 carried forward from prior closes (see STATE.md Deferred
Items). Phases 46/47 were branch-delivered (feat/mcp e541e45, fix/commands 62b1826) and
verified this session from backfilled retrospective artifacts.

**Key accomplishments:**
- Async dual-backend `db-adapter.mjs` — node:sqlite default with pg loaded via dynamic import only under `DB_URL=postgres://`, fail-closed boot probe that never leaks the DSN, and a test-pinned literal-aware SQL rewrite table neutralizing every SQLite-ism (D-02/D-04/D-05/D-06/D-09/D-10).
- Single pg-enabled Docker image (runtime stage now COPYs node_modules + db-adapter.mjs) with the D-12 COPY pin amended to match exactly, and DB_URL documented in .env.example + forwarded via docker-compose with the SQLite-default posture explicit.
- Boot path runs through the async `db-adapter` facade (`connectDb`/`initDb`), every SQLite-specific op is `sqliteOnly`-gated, and migrations, seed, auth, 2FA, OIDC, recovery, claims, scheduler and reminder/digest sweeps now run on awaited `db.get/all/run/tx` with `transaction()` retired.
- Every remaining db.prepare/db.exec callsite (85 sites + 18 async-rippled helpers) now runs through the awaited `db.get/all/run/tx` facade, the transitional prepare/exec shim is deleted, and the phase's D-05/D-10 gates are pinned by a permanent static-audit test suite.
- A 7-test POSTGRES_TEST_URL-gated matrix proves every critical path on live Postgres — boot+auth, second-boot row-identical no-op, D-04 fail-closed boot (closed-port child, DSN never printed), reminders_sent exactly-once, case-variant login, bigint epoch typing, prefs upsert, login_challenges round-trip — invisible (all skipped, exit 0) when the env is unset; the matrix immediately exposed and closed three real pg-only bugs (two SQL rewrites + int8 typing).
- Minimal notification-click service worker plus a `src/core/push.js` module delivering exactly one toast (visible tab) or browser Notification (hidden tab) per new gated mention/assign/comment row, with a per-user+workspace seen-set and session prime.
- Derived browser-blocked badge + requestPermission user-gesture pre-step in npToggle (one-time denied toast), poll permission memo that clears the badge without reload, catalogue at 1710

---

## v1.9 Digest Context & One-Click Unsubscribe (Shipped: 2026-11-07)

**Delivered:** digest emails are self-identifying and honestly unsubscribable — one email
per workspace with its name in the subject, "Project — Task" task lines leak-safe through
the memberCanReadProject funnel, hostile-name-proof RFC 2047 subjects, and RFC 8058
one-click unsubscribe via the codebase's first anonymous mutating route on a stateless
HMAC token. Shipped alongside: per-workspace logo and per-member timezones (canonicalizing
resolveTz funnel, per-member 09:00 windows).

**Phases completed:** 40-44 (5 phases, 13 plans — 40-42 = v1.9 REQs; 43-44 = v1.10 polish pulled forward)

**Stats:**
- 151 commits, 127 files changed (+15,075 / −1,039 lines)
- 5 phases, 13 plans; milestone audit: 6/6 requirements, 12/12 cross-phase wiring, 4/4 E2E flows, 0 blockers
- 3 days from milestone start to ship (2026-11-05 → 2026-11-07)
- Suite at close: 1042 tests, 1038 pass / 1 pre-existing environmental fail (totp-rewrap D-74) / 3 skipped; `npm run i18n:scan` clean

**Git range:** `0022125` (docs: archive milestone v1.8) → `d666a7d` (chore: deferred-items clean)

**Known verification overrides:** 4 newly acknowledged, 12 carried forward from a prior close (see STATE.md Deferred Items) — `override_closeout`; verification digests for Phases 40/41/43 were stale from intra-milestone source drift and were re-fingerprinted (all VERIFICATION.md files read `passed`); the milestone audit re-verified requirements, wiring and flows at HEAD (`v1.9-MILESTONE-AUDIT.md`).

**Key accomplishments:**
- `[WS]` digest subjects with "Project Name — Task Name" lines (SUBJ-01/02) — server-side project resolution, hiddenFor-funnel-safe degradation, single hardened `encodeWord` (C0 strip + RFC 2047 folding) across all four Subject call sites (SUBJ-03)
- RFC 8058 one-click: stateless HMAC token contract (UNSUB-01) consumed by `POST /unsubscribe/:token` (UNSUB-02) — 15-test response matrix, anonymous/sameOrigin-exempt/throttled/convergent, GET no-op, token never logged — with footer + settings re-subscribe preserved (UNSUB-03) and the DKIM caveat documented in DEPLOY.md §14
- Per-workspace logo: upload (magic-byte validated, role-gated), favicon fallback on every identity surface, digest header `<img>` with versioned absolute URL
- Per-member timezones: one canonicalizing resolveTz funnel, per-member scheduler windows, 418-zone static list + searchable combobox, dedup keys byte-identical under tz change; gap closure 44-04 funneled the admin doc-PUT path (WR-01) and canonicalized aliases (WR-02, A2 consciously updated)

---
## v1.8 Notification Sanity (Shipped: 2026-11-05)

**Delivered:** Every server-emitted notification renders in the recipient's locale, due-date reminders are capped at two per task, an opt-in 09:00 digest email replaces individual reminder emails, and a full cited notification audit (all rows `proposed`) gates any future trim work behind owner validation.

**Phases completed:** 36-39 (4 phases, 12 plans, 28 tasks)

**Stats:**
- 147 commits, 106 files changed (+11,768 / −951 lines)
- 4 phases, 12 plans, 28 tasks
- 2 days from milestone start to ship (2026-11-04 → 2026-11-05)
- Suite at close: 943 pass / 0 fail / 3 skipped; `npm run i18n:scan` clean

**Git range:** `4ed4c17` (docs: start milestone v1.8) → `02e9084` (docs: acknowledge D-12)

**Known verification overrides:** 1 newly acknowledged, 9 carried forward from a prior close (see STATE.md Deferred Items) — `override_closeout`; verification digests for Phases 36–38 were stale from intra-milestone source drift (incl. out-of-phase commit 7a7a423), all VERIFICATION.md files read `passed`, and the milestone audit re-verified 13/13 requirements, 11/11 cross-phase wiring and 4/4 E2E flows at HEAD (`v1.8-MILESTONE-AUDIT.md`).

**Key accomplishments:**
- Locale-parameterized `tFor()` translation core with t() delegation, Intl-failure degradation and locale clamping, plus 15 `notif.reminder.*` / `notif.email.*` server keys landed in identical EN+FR flat catalogues.
- Recipient-locale notification emails — server.js boot-registers the shared FR catalogue, resolves `u.locale` on the authority query and passes `msg.locale` into a fully tFor-rendered `buildNotifMessage` frame (greeting/verb/sentence/openTask/button/footer), with reminders getting their own keyed by-label, verb and subject; FR and EN recipients of the same workspace notification get their own language in one run.
- Reminder rows now store `key` + send-time `vars` snapshot alongside the unchanged English snippet, and the inbox localizes keyed rows per viewer locale (sentence AND preview) with byte-identical legacy rendering and snippet fallback for unknown keys.
- The i18n build gate now covers the server side — every t/tFor notif.* literal in server.js/mailer.js must resolve in en.json AND fr.json, and the notif.* namespace is parity-checked both directions, so a missing FR key or drifted catalogue entry fails `npm run i18n:scan` (SC-4) while the src-side scan output stays byte-identical.
- Opt-in daily digest — one localized 09:00-window email per member listing due-today + overdue tasks with deep links, exactly-once via a `ws:{userId}:digest:{localDate}` ledger claim, proven by a 5-test integration suite on the reminder-pass harness.
- Digest users lose individual reminder emails at the fan-out (email-only — rows/push/mentions intact) while `email_digest` becomes a real undefined-falsy opt-in with D-13 replace-framing settings copy in EN+FR.
- Recipient-scoped digest filter (`t.assignee === r.member_id` gate) closing the CR-01 confidentiality leak, proven red-before/green-after by a multi-member CI pin, plus WR-02 tautology cleanup
- docs/notification-audit.md — full cited notification audit (six type sections, RFC 8058 decision with DKIM split), every trim recommendation `proposed` pending owner validation

---

## v1.7 Team Visibility & Hardening (Shipped: 2026-11-04)

**Phases completed:** 4 phases, 12 plans, 13 tasks

**Key accomplishments:**
- Team intersection (`project.teams ∩ member.teams ≠ ∅`) now opens projects through the single `hiddenFor()` funnel via one shared `memberCanReadProject` helper also adopted by the reminder pass and email mirror — purely additive reach, byte-identical 404s preserved, MATRIX extended with team cells across doc-get/file/reminder/fanout/doc-put families.
- sameOrigin guard ordered FIRST on the invite-accept route (HARD-01/D-08), a shared `firstForwardedValue()` helper closing the multi-value x-forwarded-host gap (HARD-05/D-07), and a structural silent `{name,email,password}` whitelist with spoof pins (HARD-04/D-06) — 7 new tests, full 824-test suite green.
- both `firstWorkspace()` invite twins fail closed in one commit (accept 410 `workspaceGone`, SSO twin consumes the dead invite and lands the generic `/login?sso=error`), and link-only admin/owner invites are now impossible at creation (400 `inviteAdminEmailRequired`), harmless at accept (403 refusal), and extinct in stored data (update-only boot sweep) — with the code catalogued EN+FR and 5 new pins.
- Per-user notification preferences as SQLite rows keyed (workspace_id, user_id): single getUserNotifPrefs accessor, GET/PUT /api/me/notif-prefs with a 17-key whitelist, notifPrefs stripped from documents both directions, and reminder/email consumers resolving prefs per recipient.
- One-time guarded backfill `migrateUserNotifPrefs` — a structural clone of the migrateTeamMembership recipe that copies workspace-doc `notifPrefs` into a user_notif_prefs row for EVERY member (D-09) and deletes the doc field in the same `begin immediate` transaction (D-11), gated on a pre-migration backup — plus byte-identical-second-boot, later-joiner, corrupt-doc and SETTINGS-03 invoices pins.
- Recent-search redaction rebuilt on a tokenized matcher (src/lib/redaction.js): full-token NFC+lowercase intersection replaces substring includes, pinned by a 22-test table suite, the D-13 end-to-end scope pin, the D-15 workspace-wide pin, and the CHANGELOG SEARCH-01 limitation note.
- One branching persistence adapter for per-user notif prefs — per-workspace localStorage in local mode, PUT /api/me/notif-prefs in API mode — with the seed block removed and legacy client snapshots stripped so the doc field can never resurrect.
- GET-on-open hydration of stored notification prefs via a pure mergeNotifPrefs helper, wired at all five API-mode workspace-entry paths so an unchecked pref survives F5.
- Closed the F5-reload gap — the /w/<slug> boot routine in main.js now awaits hydrateNotifPrefs after hydrateFromServer succeeds, so an unchecked pref stays unchecked after reload in API mode, pinned by a static sweep test.
- delTeam's toast undo now awaits one doc push (new exported `pushNow()` in store.js) then replays each affected member's union team set through `api.setMemberTeams`, re-creating purged `team_members` rows without erasing newer changes.
- Forward MASTER_KEY_PREVIOUS through docker-compose.yml via the optional `${MASTER_KEY_PREVIOUS:-}` form, proven by a parse + two-case `docker compose config` test, with a DEPLOY.md §14 compose rotation walkthrough.

---

## v1.6 Team Access & Federation (Shipped: 2026-11-02)

**Phases completed:** 4 phases, 17 plans, 13 tasks

**Key accomplishments:**
- `team_members` join table is the single membership authority — guarded backfill
- every client roster/mention/picker surface now reads the projected `teams[]`
- invites now carry a full team set — `invites.teams` JSON column backfilled from
- Wired `memberInProjectTeams` into assignment surfaces via new `assignableInProject(m, p, currentAssigneeId)` predicate — assignee, subassignee, and ctx-menu pickers now exclude out-of-set members while keeping the current assignee visible.
- Membership/invite JSON scope columns + the shared `projectScope`/`hiddenFor` predicate funneled into both `redactDoc` and `mergeClientDoc`, with an admin-gated whitelist-validated scope route — proven end-to-end by a tracer slice (set → read filters → write reserved).
- The D-03 grant inversion (scope OPENS private projects — visible ⟺ in scope for scoped members) riding the single `hiddenFor` funnel, the file-serve by-id side door closed with byte-identical 404 `fileNotFound`, and the named table-driven 404-matrix per endpoint family.
- The scope predicate runs through every send-time resolution point — the server reminder pass, the defensive email mirror, the server-side assignee write-guard (400 `assigneeOutOfScope`), and the advisory client emit pre-filter (`memberScopeEligible`) — so a scoped member is never assigned, mentioned, reminded, or emailed about out-of-scope content.
- Invitations now carry a validated scope (`invites.scope`) that lands on the membership at acceptance, the guest collaborator model rides viewer + exactly-one-project (server-enforced `guestSingleProject`, private projects included via the D-03 grant), and both admin UI surfaces — invite form scope section and member modal scope editor — express the same id-based scope model with EN+FR strings at write time and no scoped-member self-indicator.
- Hand-rolled Entra OIDC authorization-code flow (confidential client + PKCE S256, RS256 id_token via JWKS) over node:crypto only — two no-oracle routes in server.js with the verbatim login session-mint, an additive oidc_identities table, oidcEnabled ground truth in /api/config, and a mock-IdP integration suite proving the whole path plus the D-02 env-gating matrix.
- Pinned-tenant verified-email linking (tid match + non-guest shape + email claim) with guest-shape rejection and a unique-index race backstop in the callback, JIT default-role clamp test-pinned at readConfig, and a 13-row table-driven SSO-08 matrix proving every tamper/claim vector fails closed with no session minted.
- The OIDC callback now stops at the verbatim D-68 challenge for TOTP-enrolled accounts (challenge row + cookie, NO session, 302 → /#tfa; the unchanged /api/auth/tfa/login completes it), and JIT provisioning reconciles pending invitations — auto-accepting a single unexpired invite through the verbatim acceptance recipe, surfacing (never mass-accepting) multiple, ignoring expired — pinned by 6 new test rows.
- With `OIDC_SSO_ONLY=true` the password door is a bare 404 (never 403-with-message, auth family intact, fully reversible with password_hash retained), the Microsoft button renders on login + join surfaces strictly from `/api/config` ground truth, all callback failures surface one generic `page.auth.ssoError` banner, the `/#tfa` and `/#invitations` fragments are wired into the SPA, and DEPLOY.md makes Entra deployment self-serve.
- Removed the parsed-but-never-consumed `OIDC_DEFAULT_ROLE` env var end-to-end (oidc.js config + factories, server.js env doc, DEPLOY.md contract, 8 clamp unit tests) per D-05's locked bare-account model, and recorded the required override on plan-02's SSO-04 must-have truth.
- Replaced the A2 tenant-vouching approximation with the literal `email_verified === true` claim — SSO linking, JIT provisioning and invite reconciliation now all fail closed to `/login?sso=error` for unverified-email tokens, pinned by 3 new negative tests and documented for operators.
- `totp_factors` single source of truth with one-time boot copy (D-06/D-09), a shared `verifyTotpAgainstFactors()` helper converted into the login second step, and a localized factor list in the existing settings 2FA card.
- All tfa step-ups and the enable challenge verify through the `totp_factors` single source of truth, plus the three factor-lifecycle routes — enroll (password + existing-factor code + required label), enable (staged secret, per-factor baseline, transactional insert), and remove (survivor-code guard, verbatim disable teardown for the last factor).
- The settings 2FA card gains the full factor lifecycle — localized list rows with relative last-used, the "Add factor" staged wizard (required naming → password + existing-factor code → QR/verify), and a per-factor remove confirm echoing the factor name — completing TOTP2-02/TOTP2-05 and the EN+FR i18n gate.

---

## v1.5 Reliability & Rotation (Shipped: 2026-11-01)

**Phases completed:** 5 phases, 17 plans, 13 tasks

**Known verification overrides:** 5 newly acknowledged, 3 carried forward from a prior close
(see STATE.md Deferred Items). Verification digests for phases 23–26 are stale (shared files
touched by later phases); final-tree evidence from Phase 27 verification (11/11) and the
v1.5 milestone audit (tech_debt, 15/15 REQs, integration 6/6, flows 5/5).

**Key accomplishments:**
- /w/:slug/task/:key now lands on the existing task drawer over the project board with the URL persisted across reload, unknown/hidden keys get the localized not-found toast, and every notification email links to APP_URL + /w/:slug/task/:key — proven by 4 e2e scenarios (EN+FR), 6 node tests, and a 575/575 full suite.
- A signed-out visitor hitting /w/:slug/task/:key gets the sign-in view with the path carried via ?next= and lands on the exact task after sign-in; the open-redirect guard is pinned by tests at both carry sites.
- Every SPA view now mirrors into browser history — go() pushes per-view URLs (/w/:slug/inbox, /project/:key, /task/:key…), one boot-time popstate handler restores views through the deep-link resolver with { back: true }, and closing the task drawer pushes the underlying view URL so Back re-opens the task.
- queueNotifEmails now resolves the byline and recipient email from the memberships⋈users authority rows (workspace-scoped), so account-backed authors show their real name instead of "Un membre" and account-backed recipients are never silently skipped.
- /w/:slug/team/:id is now a first-class deep link — urlForView() emits the keyed team URL and applyDeepLink resolves it (unknown ids land home with no oracle, bare /team shows the list) — closing the last lossy URL from 23-04.
- Relaxed the audit-trail client gates (fetch + card mount) so workspace admins see their workspace-scoped revoke rows on Settings → sessions, with the server-contract pinned by a cross-membership test — closing UAT gap G-24-5.
- Boot-time TOTP re-wrap rotation: two env vars + one reboot converges every old-envelope 2FA secret to `v2:<new-key-id>` — idempotent, transactional, backup-guaranteed, with no 2FA re-enrollment (KEY-03)
- DEPLOY.md §14 "Key custody & rotation" — a copy-pasteable operator lifecycle (generate → inject → rotate → verify 0 stale → roll back → converge → compromise policy) with every command pinned to server behavior by doc-parsing parity tests (KEY-04)
- DEPLOY.md §14 now stops a broken keyring BEFORE rotating — image-currency grep (`migrateTotpReWrap ≥ 1`) and key-id coverage (`id(MASTER_KEY_PREVIOUS)` vs DB-stamped `v2:` ids) — and a no-data-loss recovery note covers the D-K7-without-re-wrap signature (closes gap G-26-1)
- Clock-injectable `runReminderPass()` in server.js — 09:00 workspace-local window scan with transactional exactly-once dedup in a new `reminders_sent` table, `by:null` reminder rows riding the existing `queueNotifEmails` pipeline behind the `email_reminder` gate, boot catch-up + 60s unref'd tick that never writes off-hour (13 new tests, full suite 646 green).
- Three notifPrefs reminder toggles (email_reminder/due_reminder/past_due, all ON by default for new and legacy workspaces via bootstrap defaults + a normalize-on-read merge) rendered through the existing Settings tog/np save path, plus inbox filter chips and guarded system-actor rendering for the two reminder types with complete EN+FR catalogue entries (8 new keys).

---

## v1.3 Auth Hardening (Shipped: 2026-10-28)

**Phases completed:** 6 phases, 19 plans, 29 tasks

**Known verification overrides:** 0 unresolved; stale verification digests for phases 14–17
(shared files touched by later phases) accepted with final-state evidence from Phase 18 and
the milestone integration check; 3 deferred items acknowledged as documented dispositions.

**Key accomplishments:**
- 13-DECISIONS.md: the canonical D-01…D-17 citation target for Phases 14–18, carrying the code-verified stub diagnosis and all four pinned decision areas plus the Phase 14 removal scope
- 13-DECISIONS.md now cites to one answer on both verification gaps: D-04's replay-guard column lands in Phase 14 (AUTH-02 migration) with Phase 16 owning the guard behavior, and D-13's generic-copy override covers the existing server.js:1235 429 string itself; 13-01-SUMMARY.md's citation count corrected 11 → 16 with erratum
- Central mid-session 401 intercept in api.js call() funnels every revocation 401 (code signInRequired) through the single registered signOutRevoked teardown — honest signedOutElsewhere toast, full sign-out, login screen — with a once-per-revocation latch, boot-guard, and re-arm.
- Rewrote the falsified `settings.pw.done` banner copy in EN/FR to state that other sessions were signed out, and added a substring-level honesty regression guard.
- password-correct logins on 2FA accounts now stop at an inert 5-minute challenge (`pending2fa` + separate `projects_tfa_challenge` cookie); only a live TOTP or a burn-once recovery code on the new `POST /api/auth/tfa/login` mints the session — atomically, inside one shared throttle budget, with generic lockout copy.
- a correct password on an enrolled account now parks the client on a dedicated full-screen `s === '2fa'` card — masked email, one dual-shape code field, no persisted pending state — and a correct TOTP/recovery code enters through the same post-success landing as any login, with an honest post-landing report when a recovery code was burned.
- WR-01/WR-02 client state fixes for the 2FA login flow — the auth card resets before finishLogin and stale recovery-toast state can no longer survive a login — pinned by a 4-test source-structure regression suite
- Chromium proof of the three auth flows — full 2FA login (TOTP computed locally via totp.js + recovery-code burn with the honest once-only toast), session revocation and password-change revocation with the signedOutElsewhere teardown — parametric EN + FR, 10 new tests inside flows.spec.mjs
- Post-17 schema parity for login_challenges (the real pending-2FA surface — no sessions.pending_tfa column exists), a no-filter walk of every workspace document proving zero auth-bearing keys, and a second-boot snapshot extended to sessions rows + login_challenges count/pragma/DDL — D-78/D-79 discharged inside test/migration.test.mjs.
- Evidence-audited the full pitfalls checklist (22+13 rows, all green, IN-02 filed as backlog), ran the human real-device UAT — 3/3 PASS across Google Authenticator, Microsoft Authenticator and a live 2FA login — and closed with a fully green gate (526/526 unit, lint, format, build incl. i18n-scan, 55/55 e2e).

---

## v1.2 Localization (Shipped: 2026-10-25)

**Phases completed:** 8 phases, 50 plans, 68 tasks

**Key accomplishments:**
- A leaf `t()` layer over JSON catalogues, with the escaping, plural and build contracts pinned by 16 tests before a single string moves.
- The catalogue contract as 23 named tests: the markup-injection lint, the key and plural shapes, the placeholder parity, the registry agreement and the zero-dependency guard.
- The build layout became a contract: the French catalogue travels as its own chunk, an English-only build carries none of its bytes, and no catalogue key can add an icon to the bundle.
- The stored `'MMM d'` now means "follow the locale": the date and time settings rows offer an `'auto'` option, its preview is computed by the locale's own formatter, and the sentinel reaches the preference bag verbatim so it survives the first save.
- The last nine uses of the English `MON`/`MONL`/`WD`/`WDL` arrays now read the locale through `monthName()` and `weekdayName()`, the arrays are deleted, and every English header — `Sun`, `Su`, `October 2026`, `Friday, July 24`, `Jul 24` — is byte-identical to what it was.
- "elodie" now finds "Élodie" in the global search and in all nine filters — one `foldForSearch()` helper folds both sides, `hl()` maps its `<mark>` window back to the original characters, and the sort order is byte-identical (no `Intl.Collator` anywhere).
- The sixteen `n > 1 ? 's' : ''` expressions became sixteen catalogue plural objects selected by Intl.PluralRules, with the English rendering byte-identical and no hand-written plural rule left under src/
- auth.js, design-system.js and settings.js swept into the catalogue — 551 findings extracted across 482 new keys (719 → 1201), allow-list 874 → 381, scan 0 violations, all gates green
- The modal, confirmation and accessible-name half of `src/actions/actions.js` plus the six other action modules now read the catalogue — 109 literals extracted, the scanner reports zero findings for all seven files, and the machine identifiers (`data-a`, route ids, keyboard keys) are byte-identical
- The stored vocabulary now displays through the catalogue while the document keeps holding `backlog`, `todo`, `urgent`, `design` and `Owner` untouched — the display is an id-keyed `t()` lookup behind lazy getters, the core modules and the three feature modules carry no user-visible literal, and the allow-list shrank 1383 → 1299 with the scan green at 0 violations
- The task list and the five overlays now read the English catalogue — 425 literals swept, the stored permission names stay the values the document holds while only their display is a catalogue value, the action keys and icon names and sort keys stayed machine, and the allow-list shrank 1299 → 874 with the scan green at 0 violations
- The thirteen remaining page modules — activity, 404, favourites, home, inbox, members, my tasks, notifications, overview, project, projects, search and tasks — now read every heading, subtitle, empty state, form label and accessible name from the catalogue through 184 new keys, the allow-list shrank by exactly the 266 literals the wave extracted (381 → 115), and the scan is green at 0 violations
- Implemented `has()` and `tErr()` in `src/core/i18n.js` with parameter interpolation and integrated them into `src/core/api.js`, closing out the ERR-02 error-code contract.
- Activity journal stores machine verbs + structured extras end-to-end: priority as tracer slice, full 25-writer expansion, and unified drawer rendering — with D-06-equivalent filter classification over legacy + machine vocabularies.
- actExtraHtml drops legacy string extras instead of leaking them, the demo seed carries 4 structured extras, and the Projects filter selects project creation from both vocabularies.
- The keyboard-hint modifier became a lazy getter evaluated at render, the duplicated escaping table collapsed into the escHtml re-export, and uid() moved to crypto.getRandomValues with 200-call uniqueness pinned by a test.
- The 16-route overflow spec now carries a 21-route French sweep — every route first proves a catalogue-driven French marker, then proves zero English-catalogue-value leaks across text nodes, `aria-label`, `data-tip` and `document.title`, hidden nodes included.
- Two node:test contract pins now make the phase's already-true properties regression-proof — the i18n allow-list must stay exactly `[]` with the scan exiting 0 on the live tree, and package.json must carry no `dependencies` key with the Dockerfile runtime stage staying bare node + su-exec + four app COPY targets.
- A `docker-build` CI job builds the image, serves it, resolves the French catalogue chunk dynamically from the served assets and asserts French content; a Chromium e2e proves the server-less demo renders French and that the EN↔FR switch survives a reload through localStorage.
- Docs state the D-13/D-15 boundary (interface en+fr; demo seed and prototype pages not; four languages absent), the 1.2.0 draft release notes, and the new `docker-build` CI job — with the version bump and tag deliberately deferred to milestone close.
- Raw-body `POST /w/:slug/files` streams real bytes flat to `DATA_DIR/files/<id>` behind sameOrigin + member auth, size-capped mid-stream by `MAX_UPLOAD_MB` (default 25) with a 413 `uploadTooLarge` stable code — proven by real-server integration tests.
- `GET /w/:slug/file/:id` serves stored bytes to workspace members behind the D-06 fixed-mime inline/attachment policy with Accept-header SPA negotiation (D-13), and the doc-PUT handler now unlinks dropped file binaries after commit (D-04) — no orphans, no existence oracle.
- `handleFiles` now uploads real bytes over XHR with real progress (the simulated timer is gone), failures toast the stable error code and leave no record, the preview modal renders real bytes (`<img>`/native `<iframe>`), and the copied `/w/:slug/file/:id` link opens that modal inside the SPA while the server serves bytes outside it.
- the i18n/error-code contract verified green over the whole phase, `MAX_UPLOAD_MB` documented for operators with `DATA_DIR/files/` backup guidance, the retired "file contents are metadata only" limitation retracted, and the full phase gate (build + 442 tests + 43 e2e) passing.
- `/w/:slug/file/:id` is now byte-only (no Accept:text/html SPA branch), and both « Copier le lien » entry points put the identical published URL on the clipboard — the PDF iframe renders and a top-level paste delivers the bytes.
- `/api/config` now discloses `maxUploadMb`, `api.init()` carries it into client state, and the dropzone hint in both locales interpolates the live knob (`{n}` placeholder at files.js:42) — an operator who turns MAX_UPLOAD_MB sees the cap they turned; the hardcoded 250 is unreachable, pinned by integration + e2e proofs.
- Byte-range serving (206/416) in serveFileBinary plus a ~70vh PDF preview iframe close the Firefox stall/clip, and anonymous file-URL navigations now land on the login page with a path-preserving return trip — with the D-05 no-oracle, the D-06 header map and the iframe/fetch 401 contract intact.
- PDF previews widen to a 900px `.modal.xl` whose iframe crosses pdf.js's 750px Firefox toolbar breakpoint, and a PDF-only footer Download button provides a viewer-independent save affordance — with images, other preview types, the byte-only route and every locked D-03/D-05/D-06/D-09 contract exactly as they were.

---

## v1.1 Multitenant (Shipped: 2026-10-22)

**Phases completed:** 4 phases, 7 plans, 10 tasks
**Requirements:** 8/8 validated (R1–R8) · **Audit:** `tech_debt` — no blockers
**Releases:** 1.1.0 (milestone), 1.1.1 (patch, the three revision fixes)
**Archive:** `milestones/v1.1-ROADMAP.md` · `milestones/v1.1-REQUIREMENTS.md` ·
`milestones/v1.1-MILESTONE-AUDIT.md` · `milestones/v1.1-phases/`

**Delivered:** a workspace is a real tenant. It has its own row, its own unique slug, its own
document and its own URL (`/w/:slug`); an account can belong to several workspaces with a role in
each; every API call is authorised against the caller's membership of that workspace; and a
private project is redacted on the server, so a member who is not on it receives no trace of it
and cannot write to it. Existing installs migrate in place with a backup, and the milestone ships
with a real test suite: 50 `node:test` cases and 6 Chromium tests against real `server.js`
processes and real SQLite databases, wired into CI.

**Key accomplishments:**

- A workspace is a row with a unique slug and its own document; the document is redacted on read
  and merged on write, so a redacted client cannot delete or rewrite what it cannot see.
- The membership table is the single source of truth for access. Roles, status, removal, leave,
  invites, the plan and workspace deletion all go through dedicated endpoints, and the roster is
  repaired on read rather than trusted from the document.
- The migration is proven against the exact pre-tenancy schema: one backup before any rewrite, the
  workspace derived from the old document, members and invites linked, and a byte-identical
  second boot.
- A Chromium suite boots its own throwaway server and proves two-tenant isolation and
  private-project invisibility in a real browser, and CI runs it as a required job.

**Found by the milestone audit and fixed in 1.1.1:**

- Three defects in one family: the workspace revision moved without the client being able to
  follow it, so the next write was rejected with `409` and dropped while the interface still
  announced it. The triggers were a role or plan change, an invite accepted in another session,
  and a restart. Each fix has a regression guard that fails without it — server, client and
  browser.

**Known gaps (deferred, tracked in the audit and in `PROJECT.md`):** the browser URL is
write-only, two routes and eight client exports have no caller, the invite-accept route has no
`sameOrigin` check, a guest profile can be spoofed by an admin, a link-only invite can carry the
admin role, the recent-search redaction is substring-based, and eight UI flows are still unproven
by an automated test.

---

## v1.0 Initial release (pre-milestone)

Single-workspace Projects Studio: dashboard, inbox, my tasks, projects with board / list / table /
calendar / timeline / files views, members, teams, activity and settings, served by a single
Docker image behind Traefik.
