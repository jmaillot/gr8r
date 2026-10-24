# Phase 12: Real file uploads and previews - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The file feature stops being a simulation. A server endpoint stores dropped
files as real bytes under `DATA_DIR`; `handleFiles` reports real upload progress
(XHR `onprogress`) instead of the fake `setInterval` timer; the preview modal
renders real bytes for images and PDFs; and « Copier le lien » on a file resolves
to a URL that actually serves the file (workspace-scoped route) plus an in-app
hash route that opens the preview. Closes the known limitation "File contents
are metadata only; no binary upload backend".

Out of scope: paste/folder upload support (new capability), image thumbnails in
list/grid surfaces, signed or public share links for files, per-workspace
storage quotas, resume of interrupted uploads.

Requirements: **TBD** (roadmap UAT for files)

Deliverable: a dropped file is really uploaded, progress is real, images and
PDFs preview, and the copied link serves the bytes to an authorized member.

</domain>

<decisions>
## Implementation Decisions

### Storage & limits

- **D-01:** Binaries are stored **flat by file id** — `DATA_DIR/files/<file-id>`,
  one binary per record. No per-workspace directories, no sharding. The DB record
  already carries `name`, `type`, `size`.
- **D-02:** The size cap is **env-configurable** (`MAX_UPLOAD_MB`) with a sane
  default; the server rejects early with a stable error code (the v1.2 D-7
  error-code pattern). One knob to document and test.
- **D-03:** **Store all types; preview only known-safe ones.** Nothing is
  rejected at upload by type; the preview modal renders only images and PDFs,
  everything else shows a download tile. Avoids a reject-list arms race and
  keeps `fileType()` taxonomy authoritative.
- **D-04:** **Delete with record** — deleting a file record (or its task/project)
  deletes the binary in the same server mutation; `DATA_DIR` never accumulates
  orphans.

### Serving & access control

- **D-05:** File bytes sit behind the **same `requireWorkspace` gate** as every
  other endpoint: unknown or unauthorized → `404`, no existence oracle
  (v1.1 strict-isolation decision carried forward).
- **D-06:** **Inline for known-safe types, attachment for everything else.**
  Images and PDFs serve inline (for the preview modal); all other types serve
  with `Content-Disposition: attachment` and a `Content-Type` from a safe fixed
  server map — **never** the upload's claimed mime. This neutralises the
  SVG/HTML inline-rendering XSS vector under the existing CSP.
- **D-07:** The served route is **`GET /w/:slug/file/:id`** — workspace-scoped
  like every other resource, resolving auth through the existing
  `requireWorkspace(req, res, slug, minRole)` in one call. — **Reversibility:**
  costly — the URL is a published contract once « Copier le lien » copies it;
  renaming the route breaks every previously copied link.

### Progress & previews UX

- **D-08:** Real progress comes from **XHR `upload.onprogress`** events replacing
  the `setInterval` simulation — the only zero-dependency way (`fetch()` cannot
  report upload progress). XHR is a built-in, so the no-runtime-dependency
  guarantee holds.
- **D-09:** In the preview modal, **images render as `<img>` and PDFs via the
  native browser embed** (`<iframe>`/`<embed>` with the file URL). No PDF
  library — that would break the zero-runtime-dependency guarantee.
- **D-10:** **Lists and grids keep the compact type icons** (existing
  `filePrev()`); real bytes render only in the preview modal. No thumbnail grid
  redesign.
- **D-11:** **Failed uploads toast and leave no record** — a failure (oversize,
  network) shows a toast via the stable error-code pattern, the progress row
  disappears, and nothing is added to `data.files`. No retryable-row state
  machine in `S.ui.uploads`.

### Demo mode & copy-link

- **D-12:** Demo mode (`S.ui.offline`) **stays metadata-only exactly as today**
  — instant success, no bytes, no server. Honest and zero new code paths.
- **D-13:** « Copier le lien » on a file copies a URL that works both ways: the
  **SPA gains a `file/:id` hash route** that opens the preview modal, and the
  served `GET /w/:slug/file/:id` route serves real bytes when opened outside
  the SPA. One destination, both worlds.
- **D-14:** Upload entry points **do not change** — the existing dropzones and
  `data-in="uploadFiles"` inputs stay; only `handleFiles` internals swap the
  fake timer for XHR.

### Agent's Discretion

- Upload endpoint method/payload shape (`POST /w/:slug/files` multipart vs raw
  body + headers) — planner/researcher pick what fits the hand-rolled server.
- Exact default for `MAX_UPLOAD_MB` and where it is validated.
- CSP header adjustments needed for `<iframe>` PDF embedding (`frame-src`).
- Activity-log verb reuse for file uploads (`fileAdded` exists).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above. Key project
docs that constrain this phase:

### Project decisions & constraints
- `.planning/PROJECT.md` — zero-runtime-dependency guarantee; hand-rolled server; DATA_DIR layout
- `.planning/ROADMAP.md` § Phase 12 — phase goal, the "or a link to the parent task" alternative (resolved: real file route, D-13)
- `.planning/phases/11-french-sweep-build-gate-ship-hardening/11-CONTEXT.md` — D-07 stable error-code pattern; D-12 zero-dep pinning test

### Source files that define the current behavior being replaced
- `src/actions/actions.js` (`handleFiles`, `A.copyLink`, `A.previewFile`) — the simulated timer and `file/${d.fid}` link construction to replace
- `src/overlays/modals.js` (`filePreviewModal`) — the preview modal to make render real bytes
- `server.js` (routing table, `requireWorkspace`, `sendFile`, CSP header) — where the upload endpoint and file route attach

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireWorkspace(req, res, slug, minRole)` (`server.js:1140`): ready-made auth for the upload endpoint and file route.
- `sendFile()` + static serving (`server.js:1753`): existing file-serving machinery with ETag/Range handling to reuse for binaries.
- `fileType()` / `fileTypeName()` / `filePrev()` / `FT` map: type taxonomy already in place; D-03's known-safe set extends it.
- `S.ui.uploads` progress row UI (`upbar-`/`upct-` DOM ids): the progress display survives; only its driver changes.
- Error-code pattern from v1.2: server errors carry a stable `code`; the client translates — reuse for oversize/forbidden upload errors.
- Migration machinery proven by `test/migration.test.mjs` (available if the file record needs new fields).

### Established Patterns
- Workspace-scoped routes under `/w/:slug/...` with `404` on unknown/unauthorized — the file route must follow it.
- Metadata records live in the workspace JSON document (`data.files` + `task.attachments`) persisted via `save()`/revision — binary storage is new and separate; the record stays the source of truth for name/type/size.
- `deleteFile`/project deletion already splice `data.files` — D-04 hooks binary deletion into those same mutations.
- CSP header at `server.js:1741` — `img-src 'self' data:` already allows same-origin file images; PDF embedding may need `frame-src` additions.

### Integration Points
- Upload endpoint: new `POST` under `/w/:slug/files` in the manual pathname router (`server.js:1206+`), gated by `requireWorkspace` at `member` minimum.
- File route: `GET /w/:slug/file/:id` — RESERVED_SLUGS already blocks `file` as a workspace slug, so no collision.
- `handleFiles` (`actions.js:876`): swap the `setInterval` block for XHR with `onprogress`; keep the `S.ui.offline` branch as-is (D-12).
- `copyLink` (`actions.js:517`): the `file/${d.fid}` branch gains a real destination (D-13).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The owner consistently
picked the option that preserves the zero-runtime-dependency guarantee and the
strict workspace-isolation pattern.

</specifics>

<deferred>
## Deferred Ideas

- Paste / folder-upload support in dropzones — new capability beyond this phase, own phase.
- Image thumbnails in the files grid — extra render/resize surface, separate from real uploads.
- Signed share links or public file URLs — access-model change, contradicts strict isolation as designed today.
- Per-workspace storage quotas — sizing/governance concern for a future milestone.
- Resumable/chunked uploads — protocol complexity not justified by the self-hosted use case.

</deferred>

---

*Phase: 12-Real file uploads and previews*
*Context gathered: 2026-10-24*
