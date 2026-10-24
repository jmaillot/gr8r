---
phase: 12-real-file-uploads-and-previews
reviewed: 2026-10-24T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/overlays/modals.js
  - src/main.js
  - src/locales/en.json
  - src/locales/fr.json
  - scripts/i18n-scan.mjs
  - test/upload.test.mjs
  - test/i18n-core-features.test.mjs
  - e2e/flows.spec.mjs
  - e2e/server.mjs
  - .env.example
  - DEPLOY.md
  - README.md
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-10-24
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 12's upload/serving core is solid: the raw-body stream is size-capped mid-stream with partial-file cleanup (server.js:1856-1886), the serving route enforces workspace membership at the viewer floor and a strict extension→mime/inline/attachment policy with `nosniff` (server.js:1906-1973), the disposition header is sanitized against CR/LF/quote injection (server.js:1923-1927, tested at test/upload.test.mjs:140-147), ids are server-generated UUIDs so no client value ever builds a path, and the doc-PUT binary-delete diff only sweeps ids matching `[A-Za-z0-9_-]+` (server.js:1394). Tests (unit + e2e) cover the overflow/413 path, the header policy, deep-link Accept negotiation, and gating.

The findings below are authorization gaps and edge cases around the edges of that core — none invalidate the design.

## Warnings

### WR-01: Byte-serving route bypasses private-project access lists

**File:** `server.js:1936-1947`
**Issue:** `serveFileBinary` gates on workspace membership (viewer floor) and record existence in the **full stored doc** (`JSON.parse(ctx.ws.doc)`), but never applies `canSeeProject`. A member who cannot see a private project still gets the bytes at `/w/:slug/file/:id` if they learn the id. Every other read path (doc GET, redaction at `redactDoc` server.js:411-435, deep-link modal which reads the redacted `data.files`) removes hidden-project files; the byte route is the one path that does not. `A.copyLink` (`src/actions/actions.js:527`) happily hands out `file/<fid>` links, so ids do travel between members.
**Fix:** Resolve the record's project/task from the doc and apply the same redaction predicate used elsewhere:

```js
const doc = JSON.parse(ctx.ws.doc);
const file = (doc?.data?.files || []).find(f => f?.id === id);
const memberId = ctx.membership.member_id;
const project = doc?.data?.projects?.find(p => p.id === file?.project);
if (file?.project && !canSeeProject(project, memberId)) return fail(res, 404, 'fileNotFound', 'File not found');
```

### WR-02: `handleFiles` crashes on success when the target task disappeared during upload

**File:** `src/actions/actions.js:909-912`
**Issue:** On XHR success, `const tk = task(up.task); tk.attachments.push(rec);` dereferences without a null check. If the task was deleted (locally or synced away in another session) while the upload was in flight, this throws a TypeError inside `xhr.onload`: the upload row is never removed from `S.ui.uploads`, no toast fires, the doc record is half-built, and the error is unhandled.
**Fix:**
```js
if (up.task) {
  const tk = task(up.task);
  if (tk) {
    tk.attachments.push(rec);
    logAct('addedAFileTo', tk, { kind: 'fileAdded', value: up.name });
  }
}
```

### WR-03: Preview modal renders `<img>` for types the server will not serve inline (svg, heic)

**File:** `src/overlays/modals.js:301-302` vs `server.js:1906-1913` and `src/ui/helpers.js:103`
**Issue:** `fileType()` maps `svg` and `heic` to `'img'`, and `filePreviewModal` renders `<img src="/w/:slug/file/:id">` for any `type === 'img'`. But the server's inline allow-list (`FILE_INLINE_MIME`) covers only png/jpg/jpeg/gif/webp — svg and heic come back as `application/octet-stream` + `Content-Disposition: attachment` + `nosniff`. The `<img>` element cannot decode that response, so the preview modal shows a permanently broken image for these legitimate file types. The server's choice is correct for svg (scriptable content must never render); the client side of the contract was not aligned with it.
**Fix:** Gate the `<img>` branch on the same extension set the server serves inline, e.g. `const INLINE_IMG = ['png','jpg','jpeg','gif','webp']; const ext = f.name.split('.').pop().toLowerCase();` and render `<img>` only when `INLINE_IMG.includes(ext)`; fall back to the icon tile otherwise.

### WR-04: DEPLOY.md hardening section still claims uploads are simulated

**File:** `DEPLOY.md:712-713`
**Issue:** "Uploads are still simulated. Attachment names and sizes live in the workspace document; file contents are not stored. Do not treat them as backed-up files." — directly contradicted by the phase (README.md:142-144 and DEPLOY.md:176-180, 493-495 document real binaries under `DATA_DIR/files/`). An operator reading the hardening list will skip `DATA_DIR/files/` from their backup set.
**Fix:** Replace the bullet with a pointer to the backup requirement: "**Uploads** are real binaries under `DATA_DIR/files/`; include that directory in your backup set (see § Backups)."

## Info

### IN-01: Uploaded binaries are never garbage-collected when their record is never persisted

**File:** `server.js:1888-1897` and `server.js:1383-1398`
**Issue:** The upload endpoint stores bytes immediately; the metadata record only exists after the client's next doc-PUT. If the client crashes, the doc-PUT is rejected (409 revision conflict the client never retries), or the tab closes before save, the binary is orphaned forever — the strict same-PUT diff deliberately has no orphan sweep. Acceptable as a documented trade-off, but a bounded periodic sweep (or an explicit note in DEPLOY.md's backup section) would keep `DATA_DIR/files/` from silently growing.
**Fix:** Document the leak, or add a boot-time sweep of `FILES_DIR` against the union of all workspace `data.files` ids (safe because ids are validated `[A-Za-z0-9_-]+`).

### IN-02: Zero-byte uploads succeed and store an empty binary

**File:** `server.js:1876-1879`
**Issue:** `uploadBinary` resolves with `size = 0` on an empty body and `handleUpload` returns 200 with a stored empty file. No client path sends an empty File, but a raw-body caller (curl) can litter `FILES_DIR` with empty files whose records never exist.
**Fix:** `if (!size) { fs.unlink(dest, () => {}); return reject(httpError(400, 'Empty upload', 'emptyUpload')); }`

### IN-03: `handleFiles` persists records with `project: undefined` for task-drawer uploads

**File:** `src/actions/actions.js:894, 908`
**Issue:** The XHR URL passes `project=${ctx.project || ''}` and the client record uses `project: up.project` — when the upload input carries only `data-task` (task drawer), `ctx.project` is `undefined`, so the doc record omits `project` after JSON serialization. Any view that filters/lists files by project will not find it, and the server's `fileHidden` predicate can only see it through its task.
**Fix:** Resolve the missing project from the task: `project: up.project || task(up.task)?.project`.

### IN-04: Inline PDFs served with a CSP that permits script execution inside the frame

**File:** `server.js:1966`
**Issue:** Inline responses get `Content-Security-Policy: frame-ancestors 'self'` only. For a PDF (the one scriptable format allowed inline), `frame-ancestors` protects against framing elsewhere but the PDF viewer's JS runs unsandboxed-by-CSP. Low risk (pdf.js-style viewers run in a sandboxed origin; the file is already authenticated workspace content), but `sandbox` on the CSP or `referrerPolicy` would tighten it cheaply.
**Fix:** `headers['Content-Security-Policy'] = "frame-ancestors 'self'; sandbox"` — note this breaks the browser's download-from-viewer button for PDFs; verify against the D-06 contract before shipping.

---

_Reviewed: 2026-10-24_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
