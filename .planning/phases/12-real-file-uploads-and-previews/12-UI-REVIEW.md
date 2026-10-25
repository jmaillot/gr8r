# Phase 12 — UI Review

**Audited:** 2026-10-25
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md exists for this phase)
**Screenshots:** captured (desktop 1440×900, tablet 768×1024, mobile 375×812) — static captures show only the anonymous login surface; every phase-12 surface (files view, preview modal, upload progress) is behind auth, so those findings are **code-derived**
**Interaction captures:** off (workflow.ui_interaction_capture is false)
**Registry audit:** skipped — no `components.json` (shadcn not initialized) and no UI-SPEC registry table

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | **Hardcoded English literal `browse` renders inside the French dropzone** (files.js:43); a11y labels use raw `${k} view` |
| 2. Visuals | 3/4 | Image previews forced into a 16/9 frame letterbox portrait/square images |
| 3. Color | 4/4 | Zero hardcoded colors in phase files; FT taxonomy + accent tokens used consistently |
| 4. Typography | 2/4 | App has an `--fs-*` token scale; phase files bypass it with raw px values (11.5px, 12px, 13px…) |
| 5. Spacing | 3/4 | No arbitrary values; small consistent inline px set, but hand-rolled inline styles instead of classes |
| 6. Experience Design | 2/4 | Real progress + failure/empty/confirm states exist — but the upload progress row is invisible to screen readers and the offline toast offers a dead "Try again" action |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **BLOCKER — Hardcoded English `browse` literal in the dropzone (`src/views/files.js:43`)** — In the French locale the dropzone reads « Déposez des fichiers ici ou **browse** — jusqu'à {n} Mo chacun »: a user-facing string that breaks the entire i18n contract this project enforces (1532-key catalogues, i18n-scan build gate). It slipped through because the scan's machine rules flag *capitalized* literals, not lowercase ones. Fix: add `page.files.browse` to both catalogues ("browse" / "parcourir") and render `${t('page.files.browse')}`; then extend `scripts/i18n-scan.mjs` to catch unexplained lowercase literal text nodes so this class of miss fails the build.
2. **WARNING — Upload progress row is not accessible (`src/views/files.js:44`)** — The `upbar-<id>`/`upct-<id>` row (the phase's headline deliverable — real XHR progress) renders a bare `<div class="prog">` with no `role="progressbar"`, no `aria-valuenow`, and no aria-label naming the file. The codebase already has the correct accessible pattern one file away (`src/ui/helpers.js:57` emits `role="progressbar"` with `aria-valuenow/min/max`). Fix: apply the same attributes to the upload row and give it `aria-label="${esc(x.name)} — ${t('a11y.uploadProgress')}"` (new key).
3. **WARNING — Dead "Try again" action on the offline upload toast (`src/actions/actions.js:887`)** — The demo-mode early-return shows a toast with `action: t('toast.tryAgain'), onAction: () => {}` — an affordance that visibly does nothing when clicked. Fix: either remove the action button, or wire `onAction` to re-invoke `handleFiles` with the dropped files (the failed `files` argument is in scope at the call site).

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **BLOCKER (untranslated literal):** `src/views/files.js:43` — `<span class="link">browse</span>` is a raw string literal interpolated into the dropzone hint between two `t()` calls. Visible in **both** locales; destructive to the French experience. This is the single worst copy defect of the phase.
- **WARNING (a11y copy):** `src/views/files.js:38` — view-toggle buttons get `aria-label="${k} view"`, producing "grid view"/"list view" with no i18n (and no capitalization consistency with the rest of the a11y keys). Other aria-labels on the same view correctly use keys (`a11y.searchFiles`, `a11y.filterByType`, `a11y.fileOptions`).
- **Good:** error copy is specific and localized — `err.uploadTooLarge` ("File too large" / "Fichier trop volumineux"), `err.fileNotFound` ("File not found" / "Fichier introuvable") at en.json:1484–1485 / fr.json:1484–1485; `toast.uploaded` interpolates the filename ("Uploaded {name}" / "{name} téléversé"); empty states distinguish true-empty (`page.files.emptyTitle` + guidance body) from filtered-empty (`page.states.noResults` + `emptySearchBody`) — files.js:46–52. The `page.files.dropLimit` key was converted to the `{n}` placeholder form with call-site interpolation (12-06), which is exactly right.
- Context (pre-existing, out of phase scope): the shortcuts modal contains a hardcoded `then` literal (src/overlays/modals.js:291) — same i18n-escape class, older than this phase.

### Pillar 2: Visuals (3/4)

- **WARNING (layout artifact):** `src/overlays/modals.js:311` — the image branch hardcodes `aspect-ratio:16/9;object-fit:contain`. A 16:9 frame is a video convention; for portrait/square photos it produces a wide letterboxed band with large empty `--bg` gutters inside the bordered box. The PDF branch (line 313) correctly uses a document-appropriate `min(75vh,640px)` viewport after 12-07/12-08; the image branch was deliberately kept at 16/9 — reasonable for consistency, but the frame costs image legibility. Fix: constrain by height instead — `max-height:min(60vh,480px);width:100%;object-fit:contain` with no forced ratio.
- **Good focal hierarchy:** the dropzone sits at the top of the wide page with icon + hint + accent-cap (`btn btn-primary` upload trigger, files.js:40–43); grid cards combine a type-colored art tile, name, and muted meta row (`fcard .fn/.fm`, projects-files.css:258–265); icon-only buttons (`…` more, view seg) all carry aria-labels.
- **Minor:** uploads-row filename is `font-weight:500` inline while neighboring list rows use the same value via classes — cosmetic consistency, handled under Pillar 4/5.

### Pillar 3: Color (4/4)

- Zero hardcoded hex/`rgb(` values in any phase-touched UI file (`src/views/files.js`, `src/overlays/modals.js`, `src/styles/overlays.css`) — grep clean.
- Type colors flow exclusively through the `FT` taxonomy into the `--c` custom property (`--c:${FT[f.type].c}`, files.js:44/54/55) and are blended with `color-mix(in srgb, … var(--surface))` in `filePrev()` (helpers.js:115–126) — token-driven, theme-aware.
- Accent usage is disciplined: one `btn-primary` upload button per toolbar (files.js:40), dropzone hover uses `var(--accent-soft)` / `var(--accent-link)` tokens (projects-files.css:311–314), and the `.link` span on "browse" uses the link token. No accent overuse (well under 10 accent-bearing elements on the files surface).
- The one caveat keeping this from being unconditional: the accent system was not visually verified in rendered form (auth-gated screenshot) — the class-level audit is clean.

### Pillar 4: Typography (2/4)

- The app defines a real type scale in `src/styles/tokens.css:74–81` (`--fs-2xs: 11px` … `--fs-2xl: 23px`), yet the phase files bypass it entirely with raw px: `grep -c "var(--fs"` returns **0** for both `src/views/files.js` and `src/overlays/modals.js`.
- Measured distribution across views/overlays: `11px×12, 12px×11, 11.5px×10, 12.5px×8, 13px×6, 15px×3, 14px×2, 30px, 16px, 13.5px` — **10 distinct sizes** (well beyond the >4 threshold for a no-spec audit), including off-scale values (11.5px, 13.5px) that exist in no token. Notably `12.5px` duplicates `--fs-sm` but is written as a literal.
- Font weights: 400/450/500/600 inline — four weights; `450` (modals.js) is a non-token value.
- Concrete fix: replace inline `font-size:11.5px`/`12px` etc. in files.js:20/26/44 and modals.js:291/296/316 with the `--fs-*` variables, and add off-scale occurrences to a cleanup pass.
- Not scored against this phase alone (the drift is app-wide), but phase 12 *touched* these lines and wrote new literals instead of tokens — hence a 2, not a 3.

### Pillar 5: Spacing (3/4)

- No arbitrary bracket values anywhere in the phase files (grep for `[…px]`/`[…rem]` clean).
- Inline spacing values used in files.js form a small consistent set — `gap:6px`, `margin-top:6px`, `padding-left:14px` ×2, `margin-bottom:16px` ×2, `padding-top:16px` — all landing on the standard 4/6/8/14/16 rhythm; the dropzone's `padding:18px` and the CSS-file blocks use tokens (`var(--r-lg)`, etc.).
- **Minor:** the spacing lives in hand-written inline `style=` attributes (files.js:20, 26, 42–44, 55) rather than the stylesheet that owns this view (`projects-files.css`), which is where `.fcard`, `.dropzone`, `.upl` already live. A `.upl .prog` and a `.files-toolbar` class would remove five inline styles and keep future edits in one place. Scored 3 — values are consistent, placement is not.

### Pillar 6: Experience Design (2/4)

- **Present and solid:**
  - *Real loading state:* XHR `upload.onprogress` drives `--p` + pct text (actions.js:904–911) — the fake `setInterval` is gone, pinned by the PREVIEW-01 static guard.
  - *Failure handling:* non-2XX → row removed, stable-code toast, **no record pushed** (D-11); `onerror` → `err.serverUnreachable` (actions.js:896–899, 926).
  - *Empty states:* differentiated true-empty vs filtered-empty with guidance (files.js:46–52).
  - *Destructive confirmation:* file delete routes through the confirm modal with a file-named body (actions.js:1947–1949).
  - *Keyboard:* grid cards are `role="button" tabindex="0"` (files.js:54) and the global handler activates Enter/Space on `[role="button"]` (keyboard.js:171).
  - *Preview states by type:* img → real bytes, pdf → native iframe with viewer-independent footer Download anchor (modals.js:310–327), other types keep the download tile — the D-03 tri-state is correctly implemented.
- **WARNING (a11y gap):** the upload progress bar (files.js:44) lacks `role="progressbar"`/`aria-valuenow` — see Priority Fix 2. The accessible variant already exists at helpers.js:57; the phase's flagship surface simply doesn't use it.
- **WARNING (dead affordance):** offline toast "Try again" with an empty `onAction: () => {}` (actions.js:887) — see Priority Fix 3.
- **Minor:** no cancel affordance on in-flight uploads (progress rows are not dismissible; only failure removes them). D-11 scoped out a retryable-row state machine, and resume was explicitly deferred in 12-CONTEXT, so this is a noted gap, not a contract violation.
- Scored 2: the phase's own headline surface (upload progress) ships a state that is present visually but absent functionally for assistive tech, plus one dead interactive affordance.

---

## Files Audited

- `src/views/files.js` (dropzone, toolbar, grid/list, uploads row)
- `src/overlays/modals.js` (`filePreviewModal`, wrap/xl selection, footer anchor)
- `src/actions/actions.js` (`handleFiles` XHR, `A.previewFile`, `A.copyLink`, `A.doLogin` `?next=`, delete confirm)
- `src/ui/helpers.js` (`filePrev`, `empty`, accessible `.prog` pattern)
- `src/styles/overlays.css` (`.modal.xl`, `.modal.lg`, `.attc .fprev`)
- `src/styles/views/projects-files.css` (`.dropzone`, `.fcard`, `.fgrid`, `.upl`, `.ftype`)
- `src/styles/tokens.css` (type scale), `src/styles/components.css` (`.prog`)
- `src/locales/en.json` / `src/locales/fr.json` (phase keys + parity)
- `src/actions/keyboard.js` (Enter/Space role-button activation)
- `server.js` (file-route header policy — visual-serving contract only)
- Screenshots: `.planning/ui-reviews/12-20261025-190654/` (desktop/tablet/mobile — anonymous login surface only)
