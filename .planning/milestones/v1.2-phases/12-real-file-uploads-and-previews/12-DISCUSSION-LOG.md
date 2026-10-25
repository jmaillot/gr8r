# Phase 12: Real file uploads and previews - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 12-Real file uploads and previews
**Areas discussed:** Storage & limits, Serving & access control, Progress & previews UX, Demo mode & copy-link

---

## Storage & limits

| Option | Description | Selected |
|--------|-------------|----------|
| Flat by file id | `DATA_DIR/files/<file-id>`, one binary per record; DB record already has name/type/size | ✓ |
| Per-workspace dirs | `DATA_DIR/files/<workspace-id>/<file-id>`, physical tenant isolation but outside the single-DB backup story | |
| Sharded subdirs | Two-level sharding by id prefix; overkill for a self-hosted app | |

**User's choice:** Flat by file id
**Notes:** — (recommended option accepted)

| Option | Description | Selected |
|--------|-------------|----------|
| 50 MB per file | Generous fixed cap | |
| 10 MB per file | Smaller fixed cap | |
| Env-configurable | `MAX_UPLOAD_MB` with a default; one more knob to document and test | ✓ |

**User's choice:** Env-configurable
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Store all, preview known-safe | Store anything; preview modal renders only images/PDF; others get a download tile | ✓ |
| Blocklist at upload | Reject dangerous mimes at upload; user friction when legit files bounce | |
| Strict allowlist | Only images and PDFs accepted; .zip/.docx become second-class | |

**User's choice:** Store all, preview known-safe
**Notes:** — (SVG/HTML inline rendering flagged as XSS vector under CSP)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete with record | Binary deleted in the same server mutation; no orphans | ✓ |
| Orphan sweep later | Binaries persist after record deletion; cleanup script sweeps later | |

**User's choice:** Delete with record
**Notes:** —

## Serving & access control

| Option | Description | Selected |
|--------|-------------|----------|
| Same auth as API | `requireWorkspace` gate, 404 on unknown/unauthorized, no existence oracle | ✓ |
| Signed link tokens | Capability URLs; links leak access to whoever holds them | |
| Public by URL | Breaks the isolation guarantee | |

**User's choice:** Same auth as API
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Inline safe, attachment else | Images/PDF inline; others `Content-Disposition: attachment` with a safe fixed Content-Type, never the claimed mime | ✓ |
| Always attachment | Kills previews — contradicts phase goal | |
| Trust claimed type | A .html upload would render as a page | |

**User's choice:** Inline safe, attachment else
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| /w/:slug/file/:id | Workspace-scoped, reuses requireWorkspace; pairs with copyLink's existing `file/${id}` | ✓ |
| Flat /file/:id | Shorter links but a second auth path outside the slug-scoped pattern | |

**User's choice:** /w/:slug/file/:id
**Notes:** —

## Progress & previews UX

| Option | Description | Selected |
|--------|-------------|----------|
| XHR progress events | Real byte-level progress, zero dependencies (fetch can't report upload progress) | ✓ |
| Chunked upload | Protocol to invent, test, and get wrong (resume, ordering) | |
| Indeterminate only | Loses the "real progress" phase goal | |

**User's choice:** XHR progress events
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| img + native PDF embed | `<img>` for images, `<iframe>`/`<embed>` for PDFs; no new dependency | ✓ |
| Images only | PDFs show a download tile; PDFs are the most common real attachment | |
| PDF.js library | Breaks the zero-runtime-dependency guarantee | |

**User's choice:** img + native PDF embed
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Icons in lists | Lists/grids keep `filePrev()` type icons; real bytes only in the modal | ✓ |
| Thumbnails in grid | Extra render/resize surface | |

**User's choice:** Icons in lists
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Toast, no record | Failure toasts via stable error code; nothing added to data.files | ✓ |
| Retryable row | Retry button in uploads list; extra state machine in S.ui.uploads | |

**User's choice:** Toast, no record
**Notes:** —

## Demo mode & copy-link

| Option | Description | Selected |
|--------|-------------|----------|
| Keep metadata-only | Demo uploads stay instant/metadata-only; honest, zero new code paths | ✓ |
| OPFS in demo | Previews work in demo too; second storage backend | |

**User's choice:** Keep metadata-only
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Hash route + real URL | SPA `file/:id` hash route opens the preview; served route serves bytes outside the SPA | ✓ |
| Link to parent task | Copy-link on a file copies the task URL; stops meaning "this file" | |
| Direct byte URL only | No in-app destination | |

**User's choice:** Hash route + real URL
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing dropzones | Same entry points; only handleFiles internals change | ✓ |
| Add paste/folder support | New capability beyond the phase boundary — deferred | |

**User's choice:** Keep existing dropzones
**Notes:** —

## the agent's Discretion

- Upload endpoint method/payload shape (multipart vs raw body + headers)
- Default value for `MAX_UPLOAD_MB` and where it is validated
- CSP header adjustments for `<iframe>` PDF embedding (`frame-src`)
- Activity-log verb reuse for file uploads (`fileAdded` exists)

## Deferred Ideas

- Paste / folder-upload support (own phase)
- Image thumbnails in the files grid
- Signed share links or public file URLs
- Per-workspace storage quotas
- Resumable/chunked uploads
