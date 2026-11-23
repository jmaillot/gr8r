# API Coverage — S3-compatible object storage (Phase 88)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Detector note: `api-coverage.cjs` returned `detected:false` on the pre-plan scope, but the phase hand-rolls an S3 SigV4 client — the matrix below is the planning-contract deliverable regardless.

Scope: the `export/s3.js` client surface over the S3 REST API (AWS S3, MinIO, B2). Bound by D-88-7 (app never deletes S3 objects, probe carve-out excepted), D-88-8 (never trust ETag), D-88-10 (minimal headers), D-33-12 (no SSE/storage-class).

| capability | decision | reason |
|---|---|---|
| PutObject (single PUT, streamed with real payload hash) | INTEGRATE | core upload path ≤512 MiB (SC-2) |
| GetObject (streamed download to staged temp + hash-on-pipe) | INTEGRATE | post-upload verify (D-88-8) + Phase 89 download seam (SC-5) |
| CreateMultipartUpload | INTEGRATE | uploads >512 MiB (SC-2) |
| UploadPart (serial 64 MiB, ≤3 attempts, retry from immutable staged file) | INTEGRATE | SC-2 / D-88-16 |
| CompleteMultipartUpload | INTEGRATE | finalize multipart transaction |
| AbortMultipartUpload | INTEGRATE | abort-on-failure per SC-2 / D-88-16 |
| HeadBucket | INTEGRATE | probe-at-save (D-88-15) |
| DeleteObject | INTEGRATE | probe `.probe/` marker delete only — the sole D-88-7 carve-out |
| HeadObject | OPT-OUT | verification is stream-back sha256 compare (D-88-8); Head gives size/metadata only, adds a signature surface without proving content |
| ListObjectsV2 | OPT-OUT | app never lists/prunes the bucket (D-88-7); task-scoped key layout (D-88-6) makes listing unnecessary in v1 — tracked for the v2 in-app pruning capability |
| DeleteObjects (batch) | OPT-OUT | app never deletes S3 objects in v1 (D-88-7) |
| GetBucketLocation | OPT-OUT | HeadBucket suffices for probe; region comes from `S3_REGION` env (D-88-13) |
| CopyObject / PutObjectTagging / GetObjectTagging / Object Lock / versioning APIs | OPT-OUT | out of scope (D-33-12 anti-features; no retention/tagging surface in v1) |
| ListMultipartUploads | OPT-OUT | abort-on-failure is in-run (D-88-16); orphan sweeps are operator lifecycle rules per DEPLOY.md guidance |
