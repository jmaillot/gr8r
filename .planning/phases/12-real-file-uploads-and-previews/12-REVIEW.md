---
phase: 12-real-file-uploads-and-previews
reviewed: 2026-10-25T00:00:00Z
depth: deep
supersedes: 12-REVIEW.md (pre-gap-closure review of 2026-10-24) — this review reflects the CURRENT source state after plans 12-05 and 12-06
files_reviewed: 13
files_reviewed_list:
  - server.js
  - src/main.js
  - src/actions/actions.js
  - src/core/api.js
  - src/views/files.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/upload.test.mjs
  - e2e/flows.spec.mjs
  - src/overlays/modals.js          # cross-referenced (filePreviewModal renders the byte route)
  - src/overlays/context-menu.js    # cross-referenced (file menu stamps data-id)
  - src/ui/helpers.js               # cross-referenced (fileType / filePrev type maps)
  - .planning/phases/12-real-file-uploads-and-previews/deferred-items.md  # context (not re-reported)
findings:
  critical: 0
  high: 2
  medium: 3
  low: 5
  total: 10
status: issues_found
---

# Phase 12: Code Review Report (fresh, post-gap-closure)

**Reviewed:** 2026-10-25
**Depth:** deep (call chains traced across server dispatch → serveFileBinary → client copyLink/preview → modals → byte route)
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Re-review of the current source after plans 12-05 (byte-only `/w/:slug/file/:id` route, one copy-link URL) and 12-06 (`maxUploadMb` across the five-hop server→UI chain). The core serving path is sound: the URL id regex `[A-Za-z0-9_-]+` plus the `path.dirname(file) !== FILES_DIR` belt-and-braces check blocks traversal in two independent layers (server.js:1991,2005,1947-1948); the D-06 extension→mime map never honours the upload's claimed type and forces scriptable types to attachment/octet-stream; ids are server UUIDs; the doc-PUT unlink diff only sweeps regex-validated ids; upload/auth gating (sameOrigin → member role → stream) is correct and tested (413 drain+unlink, viewer 403, outsider 404, hostile disposition header). The 12-05/12-06 changes themselves are correct: the dispatcher is genuinely byte-only, both copy-link entry points resolve the identical URL, and `maxUploadMb` flows env → `/api/config` → `api.init()` → t()-call-site → catalogue `{n}` with the 25 fallback on demo paths.

The defects found are **cross-module interactions** the gap-closure plans did not re-examine: the doc-record id is now the authority for bytes, but two pre-existing client actions (duplicate, delete-with-undo) assume metadata-only records and now produce broken/lost files; the modal's client-side type map disagrees with the server's D-06 inline map for svg/heic; the disclosed cap is purely informational (never enforced pre-upload); and a non-numeric `MAX_UPLOAD_MB` disables the cap entirely.

Pre-existing repo-wide lint/format failures are already logged in `deferred-items.md` and are deliberately NOT re-reported here.

## High

### H-1: `A.dupFile` creates a file record whose binary does not exist — duplicate previews and copied links 404 forever

**File:** `src/actions/actions.js:1934-1942` (interacts with `server.js:1896` upload path and `server.js:1948` serveFileBinary lookup)

**Issue:** Duplication inserts a new record `{ ...f, id: uid('f'), ... }` with a **fresh id** but no new bytes. In phase 12 the record id became the disk key (`DATA_DIR/files/<id>`) and the byte-source key (`/w/:slug/file/:id`). The duplicate's id has no matching binary, so `fs.statSync` fails and the serving route answers 404 — the duplicate's preview modal shows a broken image/iframe and its « Copier le lien » URL is dead. The record persists through doc sync (unlike the strict same-PUT unlink, which only removes ids the doc drops — the broken record is never swept). Every duplicate is a permanent corrupted artifact.

**Fix:** Either (a) duplicate **shares** the source id (duplicate record keeps `f.id` — both records then serve the same bytes; delete diff must then treat id-reuse carefully), or (b) request a byte copy from the server (small `POST /w/:slug/files/:id/duplicate` that copies the file server-side and returns the new id), or (c) remove the duplicate action from the file context menu until (b) exists. Option (c) is the smallest honest fix.

### H-2: Undo of a file delete re-adds the record but the binary was already unlinked — "Undo" silently loses the file

**File:** `src/actions/actions.js:1943-1962` (interacts with `server.js:1384-1399` D-04 unlink-on-PUT diff)

**Issue:** `A.delFile` drops the record and offers `restore(snap)` (undo → `S.data = JSON.parse(snap)` → `save()` → doc PUT). Server-side, the doc-PUT that dropped the record **unlinked** `DATA_DIR/files/<id>` in the same mutation. The undo PUT re-inserts a record pointing at a deleted binary → permanent 404. The user-visible "undo" affordance promises restoration the system cannot deliver: the bytes are irrecoverably gone. This is a data-loss path opened by making doc records authoritative over disk bytes.

**Fix:** Don't offer undo for file records (the `toast` `action` should be dropped for `A.delFile`), or change the server semantics to a grace period (e.g. move to `FILES_DIR/.trash/<id>` with sweep, restoring on re-insert). Given the strict same-PUT diff design, removing the undo affordance is the consistent fix.

## Medium

### M-1: Preview modal renders a broken `<img>` for svg/heic — client type map disagrees with the D-06 inline map

**File:** `src/overlays/modals.js:301-302` (type map at `src/ui/helpers.js:98-108`; server policy at `server.js:1907-1914`)

**Issue:** `fileType('.svg')` → `'img'` and `'heic'` → `'img'`, so `filePreviewModal` renders `<img src="/w/:slug/file/:id">`. But D-06 lists only png/jpg/jpeg/gif/webp/pdf as inline — svg and heic serve `application/octet-stream` + `Content-Disposition: attachment` (deliberately, for XSS safety). The browser refuses to render that in an `<img>`, so the modal shows a broken image for every svg/heic upload. The grid card is safe (`filePrev` is icon art only), but the modal's branch condition must match the server's inline whitelist.

**Fix:** Gate the `<img>`/`<iframe>` branches on the **server inline map**, not the client type: e.g. `const INLINE_IMG = ['png','jpg','jpeg','gif','webp']` checked against `f.name`'s extension, falling back to `filePrev(f)` otherwise.

### M-2: The disclosed cap is never enforced client-side — oversize files are fully uploaded before failing

**File:** `src/actions/actions.js:891-928` (12-06 made the knob visible at `src/views/files.js:43` and `src/core/api.js:95-97,132`)

**Issue:** 12-06's five-hop chain ends at a **hint string**; `handleFiles` never compares `file.size` against `api.maxUploadMb` before opening the XHR. A user who picks a 500 MB file with `MAX_UPLOAD_MB=25` watches the progress bar climb to 100 % and then gets the 413 toast after the full transfer. The knob is display-only; the "up to {n} MB each" message overstates what the UI does.

**Fix:** Pre-flight the size in the `forEach` at actions.js:892: `if (file.size > api.maxUploadMb * 1024 * 1024) { failRow('uploadTooLarge'); return; }` (keep the server check — defence in depth — this just avoids the doomed transfer).

### M-3: A non-numeric `MAX_UPLOAD_MB` disables the upload cap entirely while the UI reports 25

**File:** `server.js:71-72`

**Issue:** `Number(process.env.MAX_UPLOAD_MB || 25)` with e.g. `MAX_UPLOAD_MB=abc` yields `NaN`; `MAX_UPLOAD = NaN`; in `uploadBinary` (`server.js:1869`) `size > NaN` is always false, so **no upload is ever rejected** — disk fills without bound. Compounding it, `/api/config` reports `maxUploadMb: NaN` → serialized as `null` → `Number(null) || 25` on the client → the dropzone hint confidently says "up to 25 MB each" while the server enforces nothing.

**Fix:**
```js
const parsedUploadMb = Number(process.env.MAX_UPLOAD_MB || 25);
const MAX_UPLOAD_MB = Number.isFinite(parsedUploadMb) && parsedUploadMb > 0 ? parsedUploadMb : 25;
```

## Low

### L-1: `fileDisposition` leaves backslashes in the quoted filename — malformed Content-Disposition for strict parsers

**File:** `server.js:1924-1927`

**Issue:** The T-12-08 sanitizer strips CR/LF, quotes and control chars but not `\`. A record name ending in a backslash produces `filename="foo\"; filename*=...` — the `\"` escapes the closing quote, so the quoted-string is unterminated/extended for strict RFC 6266 parsers. CRLF injection is already blocked (tested at test/upload.test.mjs:156-163), so impact is limited to header mangling, not injection.

**Fix:** Extend the strip regex with `\\` (e.g. `/[\r\n"\\\u0000-\u001f\u007f]/g`) — note this keeps the intentional `no-control-regex` eslint finding already logged in deferred-items.md.

### L-2: File bytes stay in browser caches up to an hour after membership revocation

**File:** `server.js:1965`

**Issue:** `Cache-Control: private, max-age=3600` with no validators. A member whose access is revoked keeps the cached bytes re-renderable from disk cache (back button, reload) for up to an hour. Tolerable for most deployments, but it is a retention window the isolation decision (D-05/T-12-13) does not mention.

**Fix:** Consider `private, max-age=0` (or `no-store`) if revocation latency matters more than bandwidth; otherwise document the 1 h window next to T-12-13.

### L-3: Upload request carries dead query params the server never reads

**File:** `src/actions/actions.js:902` (server side: `server.js:1889-1897`)

**Issue:** `POST /w/${slug}/files?name=...&project=...&task=...` — `handleUpload` reads only the slug; metadata rides the doc channel. The `?name=` param (attacker-controllable in a forged URL, though the server ignores it) is dead surface that suggests server-side metadata handling that does not exist, and the integration test (`test/upload.test.mjs:29`) keeps it alive misleadingly.

**Fix:** Drop the query string from the XHR and from `uploadFetch`, or add a code comment on `handleUpload` stating the params are ignored by design.

### L-4: `A.rmAttach` leaves the Files-tab record (and bytes) — inconsistent with `A.delFile`

**File:** `src/actions/actions.js:865-873` vs `1951-1959`

**Issue:** `handleFiles` pushes the record into **both** `D().files` and `tk.attachments` when a task is set. `A.delFile` removes from both; `A.rmAttach` removes only from `tk.attachments`, so the file remains listed in the Files tab (with a link to the task) and its bytes persist. If "remove attachment" is meant to keep the workspace file, that's a defensible design — but it contradicts the delete path and will surprise users whose file "comes back" in the Files tab.

**Fix:** Either make `A.rmAttach` also remove the `D().files` record (and rely on the same-PUT unlink for the bytes), or rename the affordance so the "file is kept in Files" outcome is explicit.

### L-5: `handleFiles` mutates the doc outside `mutate()` and crashes if the attached task disappears mid-upload

**File:** `src/actions/actions.js:912-924` (specifically 916-920)

**Issue:** On XHR success the record is applied with direct `D().files.unshift(...)` + `save()` — bypassing the `mutate()` wrapper every other doc mutation uses (no snapshot/undo compatibility, pattern inconsistency). And `const tk = task(up.task); tk.attachments.push(rec)` throws a TypeError if the task was deleted (e.g. by another member syncing in) during the upload seconds — an unhandled error inside the XHR onload that also leaves the file record half-applied.

**Fix:** Wrap onload's doc changes in `mutate()` and guard the task: `if (up.task && task(up.task)) { task(up.task).attachments.push(rec); logAct(...); }`.

---

_Reviewed: 2026-10-25_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep — supersedes the 2026-10-24 pre-gap-closure review_
_Advisory only: no source files were modified; nothing here blocks._
