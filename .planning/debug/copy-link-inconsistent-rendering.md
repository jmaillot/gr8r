---
status: diagnosed
trigger: "copy a file link does not have same behaviour between the ... copy link and copy link in the embedding, url works in embedding copy link but no rendering"
created: 2026-10-25T07:30:00Z
updated: 2026-10-25T07:45:00Z
---

## Current Focus

symptoms_prefilled: true
goal: find_root_cause_only
bug_class: Bohrbug (deterministic code path)
known_pattern_candidate: "pdf-embed-rendering (G-12-1) — /w/:slug/file/:id routes Accept:text/html requests to SPA fallback instead of bytes"

hypothesis: CONFIRMED (two-compound) — (1) The "..." context-menu copy-link copies the WRONG URL (bare workspace root, no /file/:id path) because the menu builder stamps every item with data-id only (context-menu.js:12,78-87) and A.copyLink's branch chain (actions.js:517-532) resolves file links only from data-fid, which the context-menu button never sets. (2) The embedding/modal copy-link copies the correct {base}/w/{slug}/file/{fid}, but top-level navigation Accept:text/html → SPA bootstrap → applyDeepLink opens the filePreview modal (main.js:120-126) whose PDF iframe (modals.js:304) requests the same URL with Accept:text/html again → serveStatic SPA + X-Frame-Options DENY → iframe refused — so the URL "works" (SPA + modal open) but the bytes never render.
test: code trace of both copy-link UIs + delegated click dispatch + server route; node simulation of the A.copyLink branch chain with each button's dataset reproduced the exact divergence (workspace root vs /file/:id).
expecting: n/a — root cause confirmed by direct code reading + executable branch simulation.
next_action: return ROOT CAUSE FOUND to plan-phase --gaps (diagnose-only mode).

reasoning_checkpoint:
  hypothesis: Context-menu copy-link yields the workspace-root URL (missing data-fid + no data-id file branch); modal copy-link yields /file/:id, whose deep-link opens a modal whose PDF iframe gets the SPA (XFO DENY) — neither renders bytes top-level.
  confirming_evidence:
    - context-menu.js:12 `I()` template emits only `data-id`; line 82 file menu reuses it for copyLink — dataset has no data-fid.
    - actions.js:517-532 branch order: task(d.id) → pid → fid → proj(d.id) → '' ; no file lookup keyed on d.id, so a file-id data-id falls through to path=''.
    - events.js:17,35 delegates the clicked button itself to A[name], so el.dataset is the menu item's (data-id only).
    - modals.js:308 modal button sets data-fid directly → d.fid branch hit → e2e flows.spec.mjs:755 asserts clipboard == {base}/w/{slug}/file/{fid} for THIS path only.
    - main.js:120-126 applyDeepLink 'file' → openModal filePreview (no byte serving, contradicting the UAT expectation of bytes in the tab).
    - main.js:304 iframe src /w/:slug/file/:id; server.js:1997 Accept:text/html → serveStatic (XFO DENY — G-12-1). Iframe navigations send text/html (prior session's evidence).
    - Node simulation of the branch chain: ctx-menu dataset {id:'f_…'} → '/w/myws' (empty path); modal dataset {fid:'f_…'} → '/w/myws/file/f_…'.
  falsification_test: "Had the context-menu button carried data-fid, or A.copyLink had a d.id file branch, the simulation would output /w/{slug}/file/{id} for both paths — it does not. Had the modal rendered images/videos via navigation-free elements, or the iframe triggered Sec-Fetch-Dest byte serving, the top-level paste would render — the server code shows it cannot."
  fix_rationale: "Both root causes are addressable at their own layer: (a) fix URL construction (context-menu copyLink should resolve the file link — e.g. add data-fid or a data-id file branch in A.copyLink); (b) fix top-level byte rendering for /file/:id (Sec-Fetch-Dest routing or ?raw query param per G-12-1 recommendation, and/or applyDeepLink serving bytes for inline types)."
  blind_spots: "Did not run the real app to paste each URL (deterministic trace accepted for this Bohrbug); image-type files in the modal use <img> (non-navigation) so the modal path DOES render images — the 'no rendering' symptom is type-dependent (PDF/video via iframe); attachment-type deep-links currently open the modal rather than trigger a download."
  candidate_causes:
    - code: context-menu copyLink button lacks data-fid; A.copyLink has no data-id file branch (actions.js:517-532)
    - code: D-13 design — top-level /file/:id navigation intentionally opens the modal, and the modal's PDF iframe is routed to the SPA by the Accept:text/html heuristic (server.js:1997, G-12-1) instead of bytes
    - config/environment: none plausible — routing is deterministic server code, not env-dependent (ruled out by code trace)
    - data: no — file ids are unique per namespace; task(d.id)/proj(d.id) lookups deterministically miss
  and_gate: "YES — two independent defects compound: the wrong URL from the context menu (cause 1) explains the entry-point inconsistency, and cause 2 (deep-link→modal→blocked iframe) explains why even the CORRECT URL renders nothing. Fixing only one does not satisfy the UAT truth."

## Symptoms

expected: Copy a file link via the context menu, paste it into a fresh browser profile (logged in, no SPA state), and load it. Bytes render in the browser tab (inline types) or download (attachment types); the URL keeps working.
actual: The "..." context-menu copy-link and the copy-link in the preview/embedding UI behave differently; the embedding copy-link URL loads top-level but no rendering of the bytes.
errors: none reported (functional difference, not a crash)
reproduction: UAT Test 2 — copy file link via context menu vs via embedding copy button; paste into fresh browser profile; load.
started: discovered during UAT of Phase 12

## Eliminated

- hypothesis: The two entry points copy different query/fragment variants of the same file URL (e.g. one with ?raw=1 or a fragment)
  evidence: Both call the same A.copyLink (actions.js:517); the difference is in the dataset the button carries, not the URL template. Modal = data-fid → file path; ctx-menu = data-id only → empty path.
- hypothesis: The server route or Accept negotiation differs between the two pasted URLs
  evidence: server.js:1990-2001 treats every /w/:slug/file/:id identically; the ctx-menu URL never reaches that route at all (it's the workspace root → SPA home with no file path).
- hypothesis: Clipboard text differs due to api.url vs location.origin (absolute vs relative base)
  evidence: Both entry points share the same copy() call with the same `${api.url}/w/...` prefix (actions.js:531); divergence is only in the path segment, proven by the branch simulation.
- hypothesis: applyDeepLink downloads the file or does nothing on top-level paste
  evidence: main.js:120-126 — it opens the filePreview modal (openModal type:'filePreview'), whose PDF iframe then hits the G-12-1 Accept/text-html → SPA/XFO-DENY failure. The modal opens (URL "works"), the bytes never render.

## Evidence

- checked: context-menu.js I() builder (line 12) and file menu (lines 78-87)
  found: every menu button carries `data-id="${p.id}"` only; the copyLink item for files sets data-id = file id, never data-fid.
  implication: A.copyLink cannot resolve a file from the context-menu button.
- checked: actions.js A.copyLink (lines 517-532)
  found: branch chain `d.id && task(d.id) ? … : d.pid ? … : d.fid ? file/${d.fid} : d.id && proj(d.id) ? … : ''`. No file lookup keyed on d.id; the file/id branch is reachable only via data-fid.
  implication: context-menu file copyLink falls through to path='' and copies `${api.url}/w/${slug}` — the workspace root.
- checked: events.js delegated dispatch (lines 17, 35)
  found: A[el.dataset.a](el, e) passes the clicked button itself.
  implication: dataset shape is exactly what the menu builder emitted — trace is sound end-to-end.
- checked: modals.js:308 + e2e/flows.spec.mjs:751-755
  found: the modal button sets `data-fid="${f.id}"`; the e2e asserts clipboard == `${BASE_URL}/w/${owner.slug}/file/${fid}` for the MODAL path only. No e2e covers the context-menu copyLink path.
  implication: matches the user's "url works in embedding copy link" — the embedding path copies the correct URL.
- checked: node simulation of the branch chain with both button datasets
  found: ctx-menu dataset {id:'f_…'} → "/w/myws" (empty path, workspace root); modal dataset {fid:'f_…'} → "/w/myws/file/f_…".
  implication: the two copy-link entry points produce different clipboard URLs, exactly matching the reported inconsistency.
- checked: main.js init deep-link handling (lines 162-228, applyDeepLink 101-130)
  found: top-level navigation with /w/:slug/file/:id → hydrateFromServer → applyDeepLink → openModal({type:'filePreview'}). The modal for PDFs renders <iframe src="/w/:slug/file/:id"> (modals.js:304); for images <img> (non-navigation request, unaffected).
  implication: with the correct URL, a fresh-profile paste loads the SPA and opens the modal — "url works" — but the PDF iframe request carries Accept:text/html → serveStatic (server.js:1997) → index.html with X-Frame-Options DENY / frame-ancestors 'none' → iframe refused: "no rendering". This is G-12-1's root cause resurfacing one level up (deep-link instead of direct modal open).
- checked: UAT expectation vs D-13 design
  found: UAT Test 2 expects bytes in the tab / download on top-level paste; D-13 (server.js:1993-1995, main.js:116-119) intentionally opens the preview modal instead ("one destination in both worlds").
  implication: even with URL construction fixed, the expectation is unmet for PDFs while D-13 stands — a design/behavior divergence the fix plan must reconcile.

## Resolution

root_cause: Two independent defects ANDed: (1) CONTEXT-MENU COPY-LINK COPIES THE WRONG URL — cfMenu builds file-menu buttons with data-id only (context-menu.js:12,82) and A.copyLink (actions.js:517-532) resolves a file link only from data-fid (no file branch keyed on data-id), so « Copier le lien » in the "..." menu puts the bare workspace URL `${base}/w/{slug}` on the clipboard instead of `${base}/w/{slug}/file/{id}`; (2) EVEN THE CORRECT FILE URL RENDERS NOTHING TOP-LEVEL — the D-13 deep-link bootstrap (main.js:120-126) opens the filePreview modal, whose PDF iframe (modals.js:304) requests /w/:slug/file/:id with Accept:text/html and is served the SPA (server.js:1997-1998) with X-Frame-Options DENY / frame-ancestors 'none' (G-12-1), so the SPA+modal load ("url works") but the bytes are never served anywhere.
fix: (for planning) (a) make the context-menu copy-link resolve the file link — pass data-fid on the file-menu copyLink item or add a file/d.id branch in A.copyLink (also add an e2e for the ctx-menu path, currently uncovered); (b) reconcile top-level behavior with the UAT expectation — route by Sec-Fetch-Dest (document → SPA bootstrap vs iframe/empty → bytes) or a ?raw=1 param per the G-12-1 recommendation, and decide whether top-level paste should serve the bytes/download directly (per UAT truth) rather than opening the modal.
verification: diagnose-only — code trace + executable branch simulation; no fix applied.
files_changed: []
oracle_type: specified
