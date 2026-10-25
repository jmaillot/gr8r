---
phase: 12-real-file-uploads-and-previews
reviewed: 2026-10-25T00:00:00Z
depth: standard
incremental: true
diff_base: 5e8a2573231b0248f15b9c00e4086c4866b667f3
scope: 12-07 gap-closure only (G-12-4 byte-range serving + ~70vh PDF iframe; G-12-5 302 login redirect + ?next= consumption) — standing findings from the prior 12-REVIEW.md are NOT re-reported
files_reviewed: 5
files_reviewed_list:
  - e2e/flows.spec.mjs
  - server.js
  - src/actions/actions.js
  - src/overlays/modals.js
  - test/upload.test.mjs
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 12: Code Review Report (incremental re-review of plan 12-07)

**Reviewed:** 2026-10-25
**Depth:** standard (diff-scoped against 5e8a257; cross-checked against src/main.js boot, prior 12-REVIEW.md, and Node runtime behavior for the range edge cases)
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Scope was the 12-07 diff only: single-range serving in `serveFileBinary`, the ~70vh PDF iframe in `filePreviewModal`, the anonymous 302 `/login?next=` redirect in the server dispatch, the client-side `?next=` consumption in `A.doLogin`, and the new tests in `test/upload.test.mjs` / `e2e/flows.spec.mjs`. Standing findings from the prior REVIEW.md (dupFile broken duplicates, delete-undo data loss, svg/heic preview mime mismatch, display-only upload cap, non-numeric `MAX_UPLOAD_MB`, disposition backslash, cache retention, dead query params) were not re-verified and remain open as documented there.

The pinned contracts all hold in the new code:

- **D-05 / T-12-16 (no oracle):** the 302 fires in the dispatcher before any workspace/record lookup (`server.js:2073-2081`) and is byte-identical for real, unknown, and foreign slugs; authenticated-but-unauthorized callers still 404 through `serveFileBinary` regardless of `Sec-Fetch-Dest`. Both are asserted in the new unit test (upload.test.mjs:292-364).
- **T-12-15 (next validation):** server side, `next` is built only from `url.pathname` (never the query string, never a client parameter) and is same-origin path-only by construction; the leading-slash/`//`/backslash/`://` assertion is redundant defense in depth. Client side, `A.doLogin` (actions.js:2516-2520) re-validates with the identical predicate before `location.assign`, and an invalid/missing `next` falls through to the `wantedSlug` flow — the queued-invite (`S.ui.join`) path is unaffected because `/login?next=` and `/join/:token` states cannot coexist at boot (main.js:160-194).
- **T-12-17 (range DoS):** slices are bounded `createReadStream({start,end})` windows; the 416 path is header-only with no stream; multi-range, wrong-unit, and malformed headers are ignored into the pre-existing 200-full-body path (no amplification); hostile range syntax cannot reach a file read. Verified line by line.
- **D-13 byte-only route and D-06 header policy:** untouched by the redirect — the 302 only fires for anonymous `document`/metadata-less navigations; iframe/fetch destinations keep the JSON 401.
- **i18n build gate:** the new e2e test asserts only catalogue-backed surfaces via the existing `uploadDict`/`loginDict`/`fmt` helpers; no new raw-English splices and no locale-file changes.
- **`fileType`/boot interplay:** `/login` falls through `serveStatic`'s SPA fallback (extensionless path → index.html), where main.js renders `S.ui.auth = 'login'` for a session-less visitor while preserving `location.search` for `doLogin` to consume — the redirect target is real.

One new defect was found, in the range-math edge for zero-byte stored files (reachable through a normal empty-file upload plus one crafted header).

## Critical Issues

### CR-01: Suffix range on a zero-byte stored file produces a malformed 206 (`bytes 0--1/0`) and a synchronous `ERR_OUT_OF_RANGE` throw after headers are sent

**File:** `server.js:1982-1985` (suffix branch), manifesting at `server.js:2019-2022` (header emission) and `server.js:2026` (stream creation)

**Issue:** The new suffix-range branch computes `end: stat.size - 1` unconditionally. For a **zero-byte** file (a legitimate state: `uploadBinary` happily stores an empty body and the client creates the record through the doc channel), any nonzero suffix range — e.g. `Range: bytes=-5` — yields `range = { start: 0, end: -1 }`. No guard catches it: the unsatisfiable checks (`n === 0` at server.js:1984 and `a >= stat.size` at server.js:1989) only cover the `bytes=-0` and open/explicit-start forms. The handler then answers **206** with `Content-Range: bytes 0--1/0` and `Content-Length: 0` — an RFC 9110-invalid Content-Range (the code comment at server.js:1957-1975 explicitly promises this class of range is unsatisfiable) — and then `fs.createReadStream(file, { start: 0, end: -1 })` **throws synchronously** (`ERR_OUT_OF_RANGE: The value of "end" is out of range. It must be >= 0`; verified against the exact branch with Node) after `writeHead` has already committed the headers. The server's outer catch sees `res.headersSent` and just ends a corrupt response. No crash and no data exposure — the throw is caught — but any authenticated member can reliably produce a protocol-invalid response with one header, and any range-aware client (pdf.js retries with suffix ranges) hits it on every empty inline file. The new range test (upload.test.mjs:223-284) never plants a zero-byte file, which is exactly why this slipped through.

**Fix:**

```js
if (m[1] === '') {
  const n = Number(m[2]);
  if (n === 0 || stat.size === 0) unsatisfiable = true; // suffix on an empty file: no bytes exist to satisfy it
  else range = { start: Math.max(0, stat.size - n), end: stat.size - 1 };
}
```

Optionally add a belt-and-braces guard just before the 206 write so no future branch can emit a negative end:

```js
if (range && range.end < 0) unsatisfiable = true;
```

And close the test gap in the G-12-4 range test by planting a zero-byte file and asserting `bytes=-5` → `416` with `Content-Range: bytes */0` (the `bytes=0-` form on an empty file already answers 416 correctly via the `a >= stat.size` check).

## Warnings

_None. No new warning-severity issues were introduced by the 12-07 diff._

## Info

_None._

---

_Reviewed: 2026-10-25T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard (incremental, diff-scoped to plan 12-07 against base 5e8a257)_
